import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
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
  verifyAnswer,
  type AnswerOutput,
} from '../evidence/verify.js';
import { readJobInput } from '../job/input.js';
import { ensureAgents, reloadOpencode } from '../llm/agents.js';
import { LlmError, runAgent } from '../llm/providers.js';
import {
  hasProjectCache,
  loadCandidates,
} from '../projects/store.js';
import { findTailoredResume } from '../resume/find.js';
import { slugify } from '../util/slug.js';
import {
  applyProfileToCareer,
  loadUpworkProfile,
  mapProfilePortfolio,
  type UpworkProfile,
} from '../upwork/profile.js';
import { loadProposalConfig } from '../upwork/settings.js';
import { buildAnswerPrompt } from './prompt.js';

export interface AnswerRunOptions {
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
  question: string;
  hint?: string[];
  provider?: string;
  model?: string;
  timeout?: number;
  refresh?: boolean;
  noCopy?: boolean;
  debug?: boolean;
}

export async function runAnswer(options: AnswerRunOptions): Promise<void> {
  const { config } = loadConfig();
  const { config: proposalConfig } = loadProposalConfig();

  const question = readTextInput(options.question);
  if (!question) {
    throw new Error('Provide a question with -q "<text>" or -q question.txt.');
  }

  const configuredProfileUrl =
    typeof proposalConfig.profile === 'string'
      ? proposalConfig.profile
      : proposalConfig.profile?.url;
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
  if (profile) {
    const mapped = mapProfilePortfolio(profile, career, []);
    profile.portfolio = mapped.portfolio;
    profile.preferredSamples = mapped.preferredSamples;
  }

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
    'application';

  const candidates = loadCandidates(career, job);
  if (candidates.length === 0 && !hasProjectCache()) {
    console.warn(
      'dossier: no project metadata cached; run `dossier sync github` or `dossier sync local` to include repositories.',
    );
  }
  if (profile) {
    const mapped = mapProfilePortfolio(profile, career, candidates);
    profile.portfolio = mapped.portfolio;
    profile.preferredSamples = mapped.preferredSamples;
  }

  const questionSlug = options.name
    ? slugify(options.name).slice(0, 70) || 'question'
    : answerSlug(question);

  const outDir = resolveOutputDir(config.output.dir, options.out);
  mkdirSync(outDir, { recursive: true });
  const base = resolve(outDir, `answer-${slug}.${questionSlug}`);
  const markdownPath = `${base}.md`;
  const jsonPath = `${base}.json`;

  const tailored = findTailoredResume(slug, outDir);
  if (tailored) {
    console.log(
      `dossier: using tailored resume ${displayPath(tailored.resumePath)}`,
    );
  }

  const prompt = buildAnswerPrompt({
    career,
    job,
    slug,
    question,
    hint,
    client,
    profile,
    candidates,
    resume: tailored?.resume,
    trace: tailored?.trace,
  });

  console.log(
    `dossier: ${job.company ? `${job.company} — ` : ''}${job.title}`,
  );
  console.log(`dossier: ${truncate(question, 100)}`);
  if (profile) {
    console.log(`dossier: profile ${profile.name || profile.url}`);
  }
  console.log(`dossier: output ${displayPath(markdownPath)}`);

  if (options.debug) {
    writeFileSync(`${base}.prompt.txt`, prompt);
  }

  ensureAgents();
  reloadOpencode();
  let generated;
  try {
    generated = runAgent({
      prompt,
      agent: 'dossier-answerer',
      title: `Answer: ${slug}`,
      timeout: options.timeout ?? 10 * 60 * 1000,
      cwd: getRuntimeDir(),
      provider: options.provider,
      model: options.model,
      accept: (value) =>
        Boolean(
          value &&
            typeof value.answer === 'string' &&
            value.answer.trim(),
        ),
      onAttempt: ({ phase, label, reason, index, total }) => {
        if (phase !== 'failed') return;
        const next = index + 1 < total ? '; trying the next provider' : '';
        console.warn(`dossier: ${label} failed: ${reason}${next}`);
      },
    });
  } catch (error) {
    const raw = error instanceof LlmError ? error.raw : '';
    if (raw || options.debug) {
      writeFileSync(`${base}.opencode-output.jsonl`, raw);
    }
    if (!(error instanceof LlmError)) throw error;
    const saved = raw
      ? ` Raw output saved to ${base}.opencode-output.jsonl.`
      : '';
    throw new Error(`${error.message}${saved}`);
  }

  const output = generated.output as unknown as AnswerOutput;
  if (typeof output.answer !== 'string' || !output.answer.trim()) {
    throw new Error('Model response is missing a non-empty "answer" string.');
  }

  const providerLabel = generated.model
    ? `${generated.provider.label} (${generated.model})`
    : `${generated.provider.label} (default model)`;
  console.log(`dossier: draft from ${providerLabel}`);

  const verification = verifyAnswer({
    output,
    career,
    candidates,
    hint,
    client,
    profile,
  });

  if (verification.errors.length > 0) {
    writeFileSync(`${base}.opencode-output.jsonl`, generated.raw || '');
    for (const error of verification.errors) {
      console.error(`  error: ${error}`);
    }
    for (const warning of verification.warnings) {
      console.error(`  warning: ${warning}`);
    }
    throw new Error(
      `Answer failed verification. Raw output saved to ${base}.opencode-output.jsonl.`,
    );
  }

  if (options.debug) {
    writeFileSync(`${base}.prompt.txt`, prompt);
    writeFileSync(`${base}.opencode-output.jsonl`, generated.raw || '');
  }

  const answer = output.answer.trim();
  writeFileSync(markdownPath, `${answer}\n`);
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
        profile: profile
          ? {
              url: profile.url,
              name: profile.name,
              title: profile.title,
              location: profile.location,
              rate: profile.rate,
              portfolio: profile.portfolio,
              fetchedAt: profile.fetchedAt,
              cached: Boolean(profile.cached),
            }
          : null,
        question,
        hint: hint || null,
        questionType: output.question_type ?? 'other',
        answer,
        claims: output.claims ?? [],
        evidence: output.evidence ?? [],
        gaps: output.gaps ?? [],
        followUp: output.follow_up ?? [],
        provider: generated.provider.label,
        model: generated.model,
        cost: generated.stats?.cost ?? 0,
        generatedAt: new Date().toISOString(),
        sources: {
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
    `dossier: verified ${verification.claimCount} claim(s), ${verification.evidenceCount} evidence id(s), ${verification.gapCount} gap(s)`,
  );
  console.log(`dossier: saved ${markdownPath}`);

  if (!options.noCopy) {
    try {
      await clipboard.write(answer);
      console.log('dossier: copied to clipboard');
    } catch {
      console.warn(
        `dossier: could not copy to clipboard. Answer saved at ${markdownPath}.`,
      );
    }
  }

  console.log('');
  console.log(answer);

  if ((output.follow_up ?? []).length > 0) {
    console.log('');
    console.log('dossier: follow-up:');
    for (const item of output.follow_up ?? []) console.log(`  - ${item}`);
  }

  if ((output.gaps ?? []).length > 0) {
    console.log('');
    console.log('dossier: gaps:');
    for (const gap of output.gaps ?? []) console.log(`  - ${gap}`);
  }
}

function answerSlug(value: string): string {
  const slug = slugify(value);
  if (slug.length <= 50) return slug || 'question';
  const cut = slug.slice(0, 50);
  const lastDash = cut.lastIndexOf('-');
  return (lastDash > 10 ? cut.slice(0, lastDash) : cut) || 'question';
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

function truncate(value: string, length: number): string {
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}
