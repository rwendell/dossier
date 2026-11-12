import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPrecursorDir, tracePathFor } from '../config/paths.js';
import type { Resume, Trace } from './types.js';

export interface FoundTailoredResume {
  resume: Resume;
  trace: Trace | null;
  resumePath: string;
  tracePath: string | null;
}

/**
 * Find a resume produced by `dossier tailor` for the same job slug. Proposal
 * and answer use it as primary framing when present.
 */
export function findTailoredResume(
  slug: string,
  outDir: string,
  cwd = process.cwd(),
): FoundTailoredResume | null {
  const candidates = [
    join(getPrecursorDir(), `resume-${slug}.json`),
    join(outDir, `resume-${slug}.json`),
    join(cwd, `resume-${slug}.json`),
  ];

  for (const resumePath of [...new Set(candidates)]) {
    if (!existsSync(resumePath)) continue;
    const tracePath = locateTrace(resumePath);
    return {
      resume: JSON.parse(readFileSync(resumePath, 'utf8')) as Resume,
      trace: tracePath
        ? (JSON.parse(readFileSync(tracePath, 'utf8')) as Trace)
        : null,
      resumePath,
      tracePath,
    };
  }

  return null;
}

/** Traces live in the cache; older runs kept one next to the resume. */
export function locateTrace(resumePath: string): string | null {
  const cached = tracePathFor(resumePath);
  if (existsSync(cached)) return cached;
  const legacy = resumePath.replace(/\.json$/i, '.trace.json');
  return existsSync(legacy) ? legacy : null;
}
