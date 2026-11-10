import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadCareer } from '../career/load.js';
import { loadConfig } from '../config/config.js';
import { resolveOutputDir } from '../config/paths.js';
import { getPdfPageCount } from '../resume/render.js';
import type { Resume, Trace } from '../resume/types.js';
import { verifyTailoredResume } from '../resume/verify.js';
import { slugify } from '../util/slug.js';

export interface VerifyRunOptions {
  input: string;
}

export async function runVerify(options: VerifyRunOptions): Promise<void> {
  const { config } = loadConfig();
  const resolved = resolveResumeFiles(
    options.input,
    resolveOutputDir(config.output.dir, undefined),
  );
  const resume = JSON.parse(
    readFileSync(resolved.resumePath, 'utf8'),
  ) as Resume;
  const trace = JSON.parse(
    readFileSync(resolved.tracePath, 'utf8'),
  ) as Trace;
  const { career } = loadCareer();

  const verification = await verifyTailoredResume({
    resume,
    trace,
    career,
  });

  for (const warning of verification.warnings) {
    console.warn(`dossier: warning: ${warning}`);
  }

  if (resolved.pdfPath && existsSync(resolved.pdfPath)) {
    const pages = await getPdfPageCount(resolved.pdfPath);
    if (pages !== 1) {
      verification.errors.push(`PDF is ${pages} pages, expected 1`);
    } else {
      console.log('dossier: PDF is 1 page');
    }
  }

  for (const error of verification.errors) {
    console.error(`dossier: error: ${error}`);
  }

  console.log(
    `dossier: ${verification.errors.length} error(s), ${verification.warnings.length} warning(s), ${verification.gaps.length} gap(s)`,
  );
  if (verification.gaps.length > 0) {
    console.log('dossier: gaps:');
    for (const gap of verification.gaps) console.log(`  - ${gap}`);
  }

  if (verification.errors.length > 0) {
    throw new Error('Resume verification failed.');
  }
}

function resolveResumeFiles(
  input: string,
  outputDir: string,
): { resumePath: string; tracePath: string; pdfPath: string | null } {
  const direct = resolve(process.cwd(), input);
  if (existsSync(direct)) {
    if (direct.toLowerCase().endsWith('.pdf')) {
      return {
        resumePath: direct.replace(/\.pdf$/i, '.json'),
        tracePath: direct.replace(/\.pdf$/i, '.trace.json'),
        pdfPath: direct,
      };
    }
    if (direct.toLowerCase().endsWith('.json')) {
      const tracePath = direct.endsWith('.trace.json')
        ? direct
        : direct.replace(/\.json$/i, '.trace.json');
      const resumePath = direct.endsWith('.trace.json')
        ? direct.replace(/\.trace\.json$/i, '.json')
        : direct;
      return {
        resumePath,
        tracePath,
        pdfPath: resumePath.replace(/\.json$/i, '.pdf'),
      };
    }
    return {
      resumePath: join(direct, 'resume.json'),
      tracePath: join(direct, 'trace.json'),
      pdfPath: join(direct, 'resume.pdf'),
    };
  }

  const slug = slugify(input.replace(/\.(json|pdf)$/i, ''));
  const candidates = [
    resolve(process.cwd(), `resume-${slug}.json`),
    resolve(outputDir, `resume-${slug}.json`),
    resolve(process.cwd(), input.endsWith('.json') ? input : `${input}.json`),
  ];
  for (const resumePath of candidates) {
    if (!existsSync(resumePath)) continue;
    return {
      resumePath,
      tracePath: resumePath.replace(/\.json$/i, '.trace.json'),
      pdfPath: resumePath.replace(/\.json$/i, '.pdf'),
    };
  }

  throw new Error(
    `Resume not found: ${input}. Pass a .json/.pdf path or a resume slug.`,
  );
}
