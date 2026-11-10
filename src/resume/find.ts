import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
    join(outDir, `resume-${slug}.json`),
    join(cwd, `resume-${slug}.json`),
  ];

  for (const resumePath of [...new Set(candidates)]) {
    if (!existsSync(resumePath)) continue;
    const tracePath = resumePath.replace(/\.json$/i, '.trace.json');
    return {
      resume: JSON.parse(readFileSync(resumePath, 'utf8')) as Resume,
      trace: existsSync(tracePath)
        ? (JSON.parse(readFileSync(tracePath, 'utf8')) as Trace)
        : null,
      resumePath,
      tracePath: existsSync(tracePath) ? tracePath : null,
    };
  }

  return null;
}
