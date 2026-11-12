import {
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { loadCareer } from '../career/load.js';
import type { Career } from '../career/schema.js';
import { loadConfig } from '../config/config.js';
import {
  displayPath,
  getCacheDir,
  getRuntimeDir,
  getPrecursorDir,
  getTraceDir,
  precursorPathFor,
  resolveOutputDir,
  tracePathFor,
} from '../config/paths.js';
import { readJobInput } from '../job/input.js';
import type { Job } from '../job/types.js';
import { prepareAgents } from '../llm/agents.js';
import { LlmError, runAgent } from '../llm/providers.js';
import {
  hasProjectCache,
  loadCandidates,
} from '../projects/store.js';
import { slugify } from '../util/slug.js';
import { openFile } from '../util/open-file.js';
import { writeRunLog } from '../util/run-log.js';
import {
  applyProfileToCareer,
  loadUpworkProfile,
} from '../upwork/profile.js';
import { applyBasicsUrlPolicy } from './basics.js';
import {
  normalizeNumberSpacing,
  normalizeThemePunctuation,
} from './format.js';
import {
  MIN_FILL_HEIGHT,
  PAGE_CONTENT_HEIGHT,
  appendAchievement,
  collectUnusedAchievements,
  removeLastHighlight,
  trimResume,
  TRIM_PLANS,
} from './one-page.js';
import { buildTailorPrompt } from './prompt.js';
import { resolveFontOverride } from './fonts.js';
import {
  createPageMeasurer,
  getPdfPageCount,
  renderHtml,
  type PageMeasurer,
} from './render.js';
import { filterExcludedSkills } from './skills.js';
import { fillProjectBulletTrace, hasTraceCoverage } from './trace.js';
import type { Resume, TailoredDraft, Trace } from './types.js';
import { verifyTailoredResume } from './verify.js';

export interface TailorRunOptions {
  input?: string;
  out?: string;
  name?: string;
  title?: string;
  company?: string;
  url?: string;
  description?: string;
  generic?: boolean;
  profile?: string;
  noProfile?: boolean;
  theme?: string;
  provider?: string;
  model?: string;
  timeout?: number;
  refresh?: boolean;
  noRender?: boolean;
  open?: boolean;
  debug?: boolean;
}

export async function runTailor(options: TailorRunOptions): Promise<void> {
  const { config } = loadConfig();

  // Resume tailoring is freelance-agnostic: it only fetches a public profile
  // when one is passed explicitly. Otherwise basics come from career.yml and
  // career.private.yml.
  const profileUrl = options.noProfile ? '' : (options.profile ?? '');

  const { career } = loadCareer();

  if (profileUrl) {
    try {
      const profile = await loadUpworkProfile(profileUrl, {
        refresh: options.refresh,
        log: (message) => console.log(`dossier: ${message}`),
        warn: (message) => console.warn(`dossier: ${message}`),
      });
      applyProfileToCareer(career, profile);
    } catch (error) {
      if (options.profile) throw error;
      console.warn(
        `dossier: could not load configured Upwork profile: ${(error as Error).message}`,
      );
    }
  }

  const autoGeneric =
    !options.generic &&
    !options.input &&
    !options.description &&
    !options.url;
  const generic = Boolean(options.generic || autoGeneric);

  let job: Job;
  if (generic) {
    if (options.input) {
      throw new Error(
        '--generic builds a general resume and does not take a job file or URL.',
      );
    }
    if (autoGeneric) {
      console.log(
        'dossier: no job source provided; building the generic resume',
      );
    }
    const genericConfig = career.generic ?? {};
    job = {
      title:
        options.title ||
        String(genericConfig.title ?? 'Software Engineer'),
      company: options.company || '',
      url: options.url || '',
      body:
        options.description ||
        String(
          genericConfig.description ??
            'Build a general-purpose software engineering resume using the strongest and most broadly relevant evidence in the fact bank.',
        ),
      source: 'generic',
      details: {},
    };
  } else {
    job = await readJobInput({
      input: options.input,
      title: options.title,
      company: options.company,
      url: options.url,
      description: options.description,
    });
  }

  if (!job.title) {
    throw new Error(
      'Could not determine a job title. Pass --title, or use a job URL/file with a title.',
    );
  }

  const theme = options.theme || config.theme;
  const slug = generic
    ? 'generic'
    : slugify([job.company, job.title].filter(Boolean).join(' ')) ||
      'application';
  const outDir = resolveOutputDir(config.output.dir, options.out);
  mkdirSync(outDir, { recursive: true });
  const nameSlug = options.name
    ? slugify(options.name).slice(0, 70) || 'resume'
    : '';
  const base = resolve(
    outDir,
    `resume-${slug}${nameSlug ? `.${nameSlug}` : ''}`,
  );
  const pdfPath = `${base}.pdf`;
  const resumePath = precursorPathFor(pdfPath);
  const tracePath = tracePathFor(resumePath);
  mkdirSync(getPrecursorDir(), { recursive: true });
  mkdirSync(getTraceDir(), { recursive: true });
  const workDir = resolve(getCacheDir(), 'tailor', slug);
  mkdirSync(workDir, { recursive: true });
  const htmlPath = resolve(workDir, 'measure.html');

  const candidates = loadCandidates(career, job);
  if (candidates.length === 0 && !hasProjectCache()) {
    console.warn(
      'dossier: no project metadata cached; run `dossier sync github` or `dossier sync local` to include repositories.',
    );
  }
  const prompt = buildTailorPrompt({ career, job, slug, candidates });

  console.log(
    `dossier: ${job.company ? `${job.company} — ` : ''}${job.title}`,
  );
  console.log(
    `dossier: output ${displayPath(
      options.noRender ? resumePath : pdfPath,
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
      agent: 'dossier-tailor',
      title: `Tailor: ${slug}`,
      timeout: options.timeout ?? 10 * 60 * 1000,
      cwd: getRuntimeDir(),
      provider: options.provider,
      model: options.model,
      accept: (value) => {
        if (
          !value ||
          typeof value.resume !== 'object' ||
          value.resume === null ||
          typeof value.trace !== 'object' ||
          value.trace === null
        ) {
          return false;
        }
        const draft = value as unknown as TailoredDraft;
        fillProjectBulletTrace(draft);
        return hasTraceCoverage(draft.resume, draft.trace);
      },
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

  const draft = generated.output as unknown as TailoredDraft;
  if (!draft.resume || typeof draft.resume !== 'object') {
    throw new Error('Model response is missing the "resume" object.');
  }
  if (!draft.trace || typeof draft.trace !== 'object') {
    throw new Error('Model response is missing the "trace" object.');
  }

  if (!draft.resume.$schema) {
    draft.resume.$schema =
      'https://raw.githubusercontent.com/jsonresume/resume-schema/master/schema.json';
  }
  normalizeNumberSpacing(draft.resume);
  normalizeThemePunctuation(draft.resume);
  const basicsChange = applyBasicsUrlPolicy(draft.resume, career);
  if (basicsChange) console.log(`dossier: ${basicsChange}`);
  const removedSkills = filterExcludedSkills(draft.resume, career);
  if (removedSkills.length > 0) {
    console.log(
      `dossier: removed vague skills: ${removedSkills.join(', ')}`,
    );
  }

  writeResumeFiles(resumePath, tracePath, draft.resume, draft.trace);

  const initialVerification = await verifyTailoredResume({
    resume: draft.resume,
    trace: draft.trace,
    career,
    candidates,
  });
  if (initialVerification.errors.length > 0) {
    const logPath = writeRunLog(
      base,
      '.opencode-output.jsonl',
      generated.raw || '',
    );
    for (const error of initialVerification.errors) {
      console.error(`  error: ${error}`);
    }
    throw new Error(
      `Resume failed verification. Files are preserved at ${resumePath} and ${tracePath}. Raw output saved to ${logPath}.`,
    );
  }

  const providerLabel = generated.model
    ? `${generated.provider.label} (${generated.model})`
    : `${generated.provider.label} (default model)`;
  console.log(`dossier: draft from ${providerLabel}`);

  if (!options.noRender) {
    let measurer: PageMeasurer | null = null;
    try {
      measurer = await createPageMeasurer();
      await ensureOnePage({
        resume: draft.resume,
        trace: draft.trace,
        resumePath,
        tracePath,
        pdfPath,
        htmlPath,
        theme,
        career,
        measurer,
      });
    } finally {
      if (measurer) await measurer.close();
      rmSync(htmlPath, { force: true });
    }
    console.log('dossier: PDF is 1 page');
  }

  const finalVerification = await verifyTailoredResume({
    resume: draft.resume,
    trace: draft.trace,
    career,
    candidates,
  });
  if (finalVerification.errors.length > 0) {
    for (const error of finalVerification.errors) {
      console.error(`  error: ${error}`);
    }
    throw new Error(
      `Resume failed final verification. Files are preserved at ${resumePath} and ${tracePath}.`,
    );
  }
  for (const warning of finalVerification.warnings) {
    console.warn(`dossier: warning: ${warning}`);
  }

  console.log(`dossier: resume ${resumePath}`);
  console.log(`dossier: trace ${tracePath}`);
  if (!options.noRender) {
    console.log(`dossier: saved ${displayPath(pdfPath)}`);
  }
  if (finalVerification.gaps.length > 0) {
    console.log('dossier: gaps:');
    for (const gap of finalVerification.gaps) console.log(`  - ${gap}`);
  }

  const shouldOpen = options.open ?? config.output.open;
  if (!options.noRender && shouldOpen) {
    if (!openFile(pdfPath)) {
      console.warn(
        `dossier: could not open the PDF preview. Open ${pdfPath} manually or pass --no-open.`,
      );
    }
  }
}

async function applyFontOverride(
  measurer: PageMeasurer,
  htmlPath: string,
): Promise<void> {
  const stack = await measurer.fontFamily(htmlPath);
  const override = await resolveFontOverride(stack, (message) =>
    console.log(`dossier: ${message}`),
  );
  if (!override) return;
  console.warn(
    `dossier: warning: theme font "${override.requested}" resolves to "${override.resolved}", which draws symbols instead of letters`,
  );
  console.warn(
    'dossier: using the fallback serif for the PDF; install a serif font (e.g. fonts-liberation) to use the theme font',
  );
  measurer.setExtraCss(override.css);
}

async function ensureOnePage({
  resume,
  trace,
  resumePath,
  tracePath,
  pdfPath,
  htmlPath,
  theme,
  career,
  measurer,
}: {
  resume: Resume;
  trace: Trace;
  resumePath: string;
  tracePath: string;
  pdfPath: string;
  htmlPath: string;
  theme: string;
  career: Career;
  measurer: PageMeasurer;
}): Promise<void> {
  writeResumeFiles(resumePath, tracePath, resume, trace);
  renderHtml(resumePath, htmlPath, theme);
  await applyFontOverride(measurer, htmlPath);
  let height = await measurer.measure(htmlPath);
  console.log(
    `dossier: draft fill ${Math.round(height)}px (page ${PAGE_CONTENT_HEIGHT}px)`,
  );

  let pages: number | null = null;
  if (height <= PAGE_CONTENT_HEIGHT) {
    await measurer.renderPdf(htmlPath, pdfPath);
    pages = await getPdfPageCount(pdfPath);
    if (pages === 1) {
      await ensureFilled({
        resume,
        trace,
        resumePath,
        tracePath,
        pdfPath,
        htmlPath,
        theme,
        career,
        measurer,
        height,
      });
      return;
    }
    console.log(
      `dossier: HTML fits but PDF is ${pages} pages; trimming further`,
    );
  } else {
    console.log(
      `dossier: draft is over one page (${Math.round(height)}px); trimming`,
    );
  }

  for (let level = 0; level < TRIM_PLANS.length; level += 1) {
    if (!trimResume(resume, trace, level)) continue;

    writeResumeFiles(resumePath, tracePath, resume, trace);
    renderHtml(resumePath, htmlPath, theme);
    height = await measurer.measure(htmlPath);
    if (height > PAGE_CONTENT_HEIGHT) {
      console.log(
        `dossier: trim attempt ${level + 1}: ${Math.round(height)}px; still too tall`,
      );
      continue;
    }

    await measurer.renderPdf(htmlPath, pdfPath);
    pages = await getPdfPageCount(pdfPath);
    if (pages === 1) {
      console.log('dossier: PDF now fits on one page');
      await ensureFilled({
        resume,
        trace,
        resumePath,
        tracePath,
        pdfPath,
        htmlPath,
        theme,
        career,
        measurer,
        height,
      });
      return;
    }
    console.log(
      `dossier: trim attempt ${level + 1}: HTML fits but PDF is ${pages} pages`,
    );
  }

  throw new Error(
    pages == null
      ? `Resume is still too tall after trimming. Files are preserved at ${resumePath} and ${tracePath}.`
      : `PDF is still ${pages} pages after trimming. Files are preserved at ${resumePath} and ${tracePath}.`,
  );
}

async function ensureFilled({
  resume,
  trace,
  resumePath,
  tracePath,
  pdfPath,
  htmlPath,
  theme,
  career,
  measurer,
  height: initialHeight,
}: {
  resume: Resume;
  trace: Trace;
  resumePath: string;
  tracePath: string;
  pdfPath: string;
  htmlPath: string;
  theme: string;
  career: Career;
  measurer: PageMeasurer;
  height: number;
}): Promise<void> {
  let height = initialHeight;
  console.log(
    `dossier: content fill ${Math.round(height)}px (minimum ${MIN_FILL_HEIGHT}px, page ${PAGE_CONTENT_HEIGHT}px)`,
  );
  if (height >= MIN_FILL_HEIGHT) return;

  const unused = collectUnusedAchievements(career, trace);
  console.log(
    `dossier: page is sparse; trying ${unused.length} unused achievement(s)`,
  );

  for (const candidate of unused) {
    const insertion = appendAchievement(resume, trace, candidate);
    if (!insertion) continue;

    writeResumeFiles(resumePath, tracePath, resume, trace);
    renderHtml(resumePath, htmlPath, theme);
    const next = await measurer.measure(htmlPath);

    if (next > PAGE_CONTENT_HEIGHT) {
      removeLastHighlight(resume, trace, insertion.index);
      writeResumeFiles(resumePath, tracePath, resume, trace);
      continue;
    }

    height = next;
    console.log(
      `dossier: added ${candidate.achievement.id}; fill ${Math.round(height)}px`,
    );
    if (height >= MIN_FILL_HEIGHT) break;
  }

  if (height < MIN_FILL_HEIGHT) {
    await measurer.renderPdf(htmlPath, pdfPath);
    throw new Error(
      `PDF fits on one page but is too sparse (${Math.round(height)}px; minimum ${MIN_FILL_HEIGHT}px). Add more achievements to career.yml. Files are preserved at ${resumePath} and ${tracePath}.`,
    );
  }

  await measurer.renderPdf(htmlPath, pdfPath);
  const pages = await getPdfPageCount(pdfPath);
  if (pages !== 1) {
    throw new Error(
      `PDF is ${pages} pages after filling. Files are preserved at ${resumePath} and ${tracePath}.`,
    );
  }
}

function writeResumeFiles(
  resumePath: string,
  tracePath: string,
  resume: Resume,
  trace: Trace,
): void {
  writeFileSync(resumePath, `${JSON.stringify(resume, null, '\t')}\n`);
  writeFileSync(tracePath, `${JSON.stringify(trace, null, '\t')}\n`);
}
