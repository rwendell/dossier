import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import clipboard from 'clipboardy';
import { loadCareer } from '../career/load.js';
import { loadConfig } from '../config/config.js';
import {
  displayPath,
  getRuntimeDir,
  resolveOutputDir,
} from '../config/paths.js';
import {
  verifyProposal,
  type ProposalOutput,
} from '../evidence/verify.js';
import { readJobInput } from '../job/input.js';
import { prepareAgents } from '../llm/agents.js';
import { LlmError, runAgent } from '../llm/providers.js';
import {
  hasProjectCache,
  loadCandidates,
} from '../projects/store.js';
import { findTailoredResume } from '../resume/find.js';
import { slugify, truncate } from '../util/slug.js';
import { writeRunLog } from '../util/run-log.js';
import {
  applyProfileToCareer,
  loadUpworkProfile,
  mapProfilePortfolio,
  type UpworkProfile,
} from '../upwork/profile.js';
import {
  buildProposalSettings,
  describeBudget,
  extractRequiredOpening,
  formatRate,
  loadFreelanceConfig,
  parseBudget,
  type ProposalSettings,
} from '../upwork/settings.js';
import { buildProposalPrompt } from './prompt.js';

export interface ProposalRunOptions {
  input?: string;
  out?: string;
  name?: string;
  title?: string;
  company?: string;
  url?: string;
  description?: string;
  client?: string;
  profile?: string;
  noProfile?: boolean;
  question?: string[];
  questions?: string;
  hint?: string[];
  rate?: string | number;
  rateType?: string;
  noRate?: boolean;
  timeline?: string;
  availability?: string;
  provider?: string;
  model?: string;
  timeout?: number;
  refresh?: boolean;
  noSync?: boolean;
  noCopy?: boolean;
  debug?: boolean;
}

export async function runProposal(
  options: ProposalRunOptions,
): Promise<void> {
  const { config } = loadConfig();
  const { config: freelanceConfig, path: freelanceConfigPath } =
    loadFreelanceConfig();

  const configuredProfileUrl =
    typeof freelanceConfig.profile === 'string'
      ? freelanceConfig.profile
      : freelanceConfig.profile?.url;
  const profileUrl =
    options.profile ||
    (!options.noProfile ? configuredProfileUrl : '') ||
    '';

  let profile: UpworkProfile | null = null;
  if (profileUrl) {
    try {
      profile = await loadUpworkProfile(profileUrl, {
        refresh: options.refresh,
        log: (message) => console.log(`dossier: ${message}`),
        warn: (message) => console.warn(`dossier: ${message}`),
      });
    } catch (error) {
      if (options.profile) throw error;
      console.warn(
        `dossier: could not load configured Upwork profile: ${(error as Error).message}`,
      );
    }
  }

  const { career } = loadCareer();
  if (profile) applyProfileToCareer(career, profile);

  const settings = buildProposalSettings(
    freelanceConfig,
    {
      rate: options.rate,
      rateType: options.rateType,
      noRate: options.noRate,
      availability: options.availability,
      timeline: options.timeline,
      profile: options.profile,
      noProfile: options.noProfile,
    },
    profile,
  );

  const questions = readQuestions(options);
  const hint = readHints(options.hint);
  const client = readTextInput(options.client);

  const job = await readJobInput({
    input: options.input,
    title: options.title,
    company: options.company,
    url: options.url,
    description: options.description,
  });
  if (!job.title) {
    throw new Error(
      'Could not determine a job title. Pass --title, or use a job URL/file with a title.',
    );
  }

  const slug =
    slugify([job.company, job.title].filter(Boolean).join(' ')) ||
    'upwork-job';

  const candidates = loadCandidates(career, job);
  if (candidates.length === 0 && !hasProjectCache()) {
    console.warn(
      'dossier: no project metadata cached; run `dossier sync github` or `dossier sync local` to include repositories.',
    );
  }

  const mappedPortfolio = mapProfilePortfolio(profile, career, candidates);
  if (profile) {
    profile.portfolio = mappedPortfolio.portfolio;
    profile.preferredSamples = mappedPortfolio.preferredSamples;
    if (
      !Array.isArray(freelanceConfig.preferredSamples) ||
      freelanceConfig.preferredSamples.length === 0
    ) {
      settings.preferredSamples = mappedPortfolio.preferredSamples;
    }
  }

  const requiredOpening = extractRequiredOpening(job.body);
  warnAboutBudget(job, settings);

  const outDir = resolveOutputDir(config.output.dir, options.out);
  mkdirSync(outDir, { recursive: true });
  const nameSlug = options.name
    ? slugify(options.name).slice(0, 70) || 'proposal'
    : '';
  const base = resolve(
    outDir,
    `proposal-${slug}${nameSlug ? `.${nameSlug}` : ''}`,
  );
  const markdownPath = `${base}.md`;
  const jsonPath = `${base}.json`;

  const tailored = findTailoredResume(slug, outDir);
  if (tailored) {
    console.log(
      `dossier: using tailored resume ${displayPath(tailored.resumePath)}`,
    );
  }

  const prompt = buildProposalPrompt({
    career,
    job,
    slug,
    candidates,
    profile,
    client,
    hint,
    settings,
    questions,
    requiredOpening,
    resume: tailored?.resume,
    trace: tailored?.trace,
  });

  console.log(
    `dossier: ${job.company ? `${job.company} — ` : ''}${job.title}`,
  );
  if (job.details?.budget) {
    console.log(`dossier: client budget ${describeBudget(job.details)}`);
  }
  if (profile) {
    const location = [
      profile.location.city,
      profile.location.region,
      profile.location.countryCode,
    ]
      .filter(Boolean)
      .join(', ');
    console.log(
      `dossier: profile ${profile.name || profile.url}${
        profile.rate ? ` — ${formatRate(profile.rate)}` : ''
      }${location ? ` — ${location}` : ''}`,
    );
  }
  console.log(
    `dossier: ${questions.length} screening question(s); output ${displayPath(
      markdownPath,
    )}`,
  );

  if (options.debug) {
    writeRunLog(base, '.prompt.txt', prompt);
  }

  prepareAgents();
  let generated;
  try {
    generated = runAgent({
      prompt,
      agent: 'dossier-proposer',
      title: `Proposal: ${slug}`,
      timeout: options.timeout ?? 10 * 60 * 1000,
      cwd: getRuntimeDir(),
      provider: options.provider,
      model: options.model,
      accept: (value) =>
        Boolean(
          value &&
            typeof value.proposal === 'string' &&
            value.proposal.trim(),
        ),
      onAttempt: ({ phase, label, reason, index, total }) => {
        if (phase !== 'failed') return;
        const next = index + 1 < total ? '; trying the next provider' : '';
        console.warn(`dossier: ${label} failed: ${reason}${next}`);
      },
    });
  } catch (error) {
    const raw = error instanceof LlmError ? error.raw : '';
    const logPath =
      raw || options.debug
        ? writeRunLog(base, '.opencode-output.jsonl', raw)
        : null;
    if (!(error instanceof LlmError)) throw error;
    const saved = logPath ? ` Raw output saved to ${logPath}.` : '';
    throw new Error(`${error.message}${saved}`);
  }

  const output = generated.output as unknown as ProposalOutput;
  if (typeof output.proposal !== 'string' || !output.proposal.trim()) {
    throw new Error('Model response is missing a non-empty "proposal" string.');
  }

  const providerLabel = generated.model
    ? `${generated.provider.label} (${generated.model})`
    : `${generated.provider.label} (default model)`;
  console.log(`dossier: draft from ${providerLabel}`);
  if ((generated.stats?.cost ?? 0) > 0) {
    const stats = generated.stats!;
    const tokens =
      stats.input != null
        ? `, ${stats.input} in / ${stats.output ?? '?'} out tokens`
        : '';
    console.log(`dossier: model cost $${stats.cost.toFixed(4)}${tokens}`);
  }

  const verification = verifyProposal({
    output,
    career,
    candidates,
    hint,
    client,
    settings,
    job,
    questions,
    requiredOpening,
    timeline: settings.timeline,
    profile,
  });

  if (verification.errors.length > 0) {
    const logPath = writeRunLog(
      base,
      '.opencode-output.jsonl',
      generated.raw || '',
    );
    for (const error of verification.errors) {
      console.error(`  error: ${error}`);
    }
    for (const warning of verification.warnings) {
      console.error(`  warning: ${warning}`);
    }
    throw new Error(
      `Proposal failed verification. Raw output saved to ${logPath}.`,
    );
  }

  if (options.debug) {
    writeRunLog(base, '.prompt.txt', prompt);
    writeRunLog(base, '.opencode-output.jsonl', generated.raw || '');
  }

  const proposal = output.proposal.trim();
  const screeningAnswers = Array.isArray(output.screening_answers)
    ? output.screening_answers
    : [];
  const samples = Array.isArray(output.samples) ? output.samples : [];
  const rate = output.rate ?? settings.rate ?? null;
  const timeline = output.timeline ?? settings.timeline ?? null;
  const availability = output.availability ?? settings.availability ?? null;

  writeFileSync(markdownPath, `${proposal}\n`);
  writeFileSync(
    jsonPath,
    `${JSON.stringify(
      {
        job: {
          company: job.company,
          title: job.title,
          url: job.url,
          slug,
          details: job.details ?? {},
        },
        client: client || job.details?.client || null,
        profile: profile
          ? {
              url: profile.url,
              name: profile.name,
              title: profile.title,
              location: profile.location,
              rate: profile.rate,
              hoursPerWeek: profile.hoursPerWeek,
              summary: profile.summary,
              skills: profile.skills,
              portfolio: profile.portfolio,
              fetchedAt: profile.fetchedAt,
              cached: Boolean(profile.cached),
            }
          : null,
        questions,
        requiredOpening: requiredOpening || null,
        proposal,
        hook: output.hook ?? null,
        screeningAnswers,
        rate,
        timeline,
        availability,
        samples,
        claims: output.claims ?? [],
        evidence: output.evidence ?? [],
        gaps: output.gaps ?? [],
        fit: output.fit ?? null,
        settings: {
          targetWords: settings.targetWords,
          minWords: settings.minWords,
          maxWords: settings.maxWords,
          maxChars: settings.maxChars,
          includeRate: settings.includeRate,
          includeAvailability: settings.includeAvailability,
          profileUrl: settings.profileUrl || null,
        },
        provider: generated.provider.label,
        model: generated.model,
        cost: generated.stats?.cost ?? 0,
        generatedAt: new Date().toISOString(),
        sources: {
          freelance: freelanceConfigPath,
          profile: profile?.cachePath ?? null,
          resume: tailored?.resumePath ?? null,
          trace: tailored?.tracePath ?? null,
        },
      },
      null,
      '\t',
    )}\n`,
  );

  for (const warning of verification.warnings) {
    console.warn(`dossier: warning: ${warning}`);
  }
  console.log(
    `dossier: verified ${verification.claimCount} claim(s), ${verification.evidenceCount} evidence id(s), ${verification.wordCount} words`,
  );
  console.log(`dossier: saved ${markdownPath}`);

  if (!options.noCopy) {
    try {
      await clipboard.write(proposal);
      console.log('dossier: copied to clipboard');
    } catch {
      console.warn(
        `dossier: could not copy to clipboard. Proposal saved at ${markdownPath}.`,
      );
    }
  }

  console.log('');
  console.log(proposal);

  const logistics: string[] = [];
  if (rate) logistics.push(`rate: ${formatRate(rate)}`);
  if (timeline) logistics.push(`timeline: ${timeline}`);
  if (availability) logistics.push(`availability: ${availability}`);
  if (logistics.length > 0) {
    console.log('');
    for (const line of logistics) console.log(`dossier: ${line}`);
  }

  if (screeningAnswers.length > 0) {
    console.log('');
    console.log('dossier: screening answers:');
    for (const entry of screeningAnswers) {
      console.log(`  Q: ${entry.question ?? ''}`);
      console.log(`  A: ${entry.answer}`);
      console.log('');
    }
  }

  if (samples.length > 0) {
    console.log('dossier: suggested samples:');
    for (const sample of samples) {
      const label = sample.title || sample.evidence;
      console.log(
        `  - ${label} (${sample.evidence})${sample.why ? ` — ${sample.why}` : ''}`,
      );
    }
  }

  if (output.fit) {
    const fit = output.fit;
    console.log('');
    console.log(
      `dossier: fit ${fit.verdict}${
        Array.isArray(fit.reasons) && fit.reasons.length > 0
          ? ` — ${fit.reasons.join('; ')}`
          : ''
      }`,
    );
    for (const concern of fit.concerns ?? []) {
      console.log(`  concern: ${concern}`);
    }
  }

  if ((output.gaps ?? []).length > 0) {
    console.log('');
    console.log('dossier: gaps:');
    for (const gap of output.gaps ?? []) console.log(`  - ${gap}`);
  }
}

function readQuestions(options: ProposalRunOptions): string[] {
  const questions: string[] = [];

  for (const value of options.question ?? []) {
    const text = readTextInput(value);
    if (!text) continue;
    questions.push(
      ...text
        .split(/\n\s*\n/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    );
  }

  if (options.questions) {
    const path = resolve(process.cwd(), options.questions);
    if (!existsSync(path) || !statSync(path).isFile()) {
      throw new Error(`Questions file not found: ${options.questions}`);
    }
    const text = readFileSync(path, 'utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim();
      if (trimmed) questions.push(trimmed);
    }
  }

  return [...new Set(questions)];
}

function readHints(values: string[] | undefined): string {
  if (!Array.isArray(values)) return '';
  return values
    .map((value) => readTextInput(value))
    .filter(Boolean)
    .join('\n\n');
}

function readTextInput(value: string | undefined): string {
  if (!value) return '';
  const path = resolve(process.cwd(), value);
  if (existsSync(path) && statSync(path).isFile()) {
    return readFileSync(path, 'utf8').trim();
  }
  return String(value).trim();
}

function warnAboutBudget(
  job: Awaited<ReturnType<typeof readJobInput>>,
  settings: ProposalSettings,
): void {
  const budget = parseBudget(job.details?.budget);
  if (
    budget &&
    settings.minHourlyRate &&
    job.details?.budgetType !== 'fixed' &&
    budget.max < settings.minHourlyRate
  ) {
    console.warn(
      `dossier: job budget ${describeBudget(job.details)} is below your minimum hourly rate ${formatRate(
        {
          type: 'hourly',
          amount: settings.minHourlyRate,
          currency: settings.currency,
        },
      )}`,
    );
  }
}
