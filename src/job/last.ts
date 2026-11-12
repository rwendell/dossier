import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { getLastJobFile, getPrecursorDir, tracePathFor } from '../config/paths.js';
import type { Job } from './types.js';

export interface LastJob extends Job {
  savedAt: string;
}

/**
 * Remember the most recent job so `dossier answer` can run without repeating
 * the posting.
 */
export function saveLastJob(job: Job): void {
  const path = getLastJobFile();
  mkdirSync(dirname(path), { recursive: true });
  const payload: LastJob = { ...job, savedAt: new Date().toISOString() };
  writeFileSync(path, `${JSON.stringify(payload, null, '\t')}\n`);
}

export function loadLastJob(): LastJob | null {
  return readLastJobFile() ?? fromNewestPrecursor();
}

function readLastJobFile(): LastJob | null {
  const path = getLastJobFile();
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as LastJob;
    if (!parsed || typeof parsed !== 'object' || !parsed.title) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Resumes tailored before `last-job.json` existed still carry enough context:
 * title, company, and the traced requirements. Reconstruct a usable job from
 * the newest one so `answer` works without repeating the posting.
 */
function fromNewestPrecursor(): LastJob | null {
  const dir = getPrecursorDir();
  if (!existsSync(dir)) return null;

  const newest = readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      const path = join(dir, file);
      return { path, mtimeMs: statSync(path).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
  if (!newest) return null;

  try {
    const resume = JSON.parse(readFileSync(newest.path, 'utf8')) as {
      basics?: { label?: string; summary?: string };
      work?: Array<{ name?: string; position?: string }>;
    };
    const work = resume.work?.[0];
    const title = resume.basics?.label || work?.position || '';
    if (!title) return null;

    const tracePath = tracePathFor(newest.path);
    let body = '';
    if (existsSync(tracePath)) {
      const trace = JSON.parse(readFileSync(tracePath, 'utf8')) as {
        requirements?: Array<{ requirement?: string }>;
      };
      body = (trace.requirements ?? [])
        .map((entry) => entry.requirement ?? '')
        .filter(Boolean)
        .join(' ');
    }

    return {
      title,
      // The first employer in the resume is not the target company, and the
      // filename does not delimit them, so leave it blank.
      company: '',
      url: '',
      body: body || resume.basics?.summary || title,
      source: 'precursor',
      details: {},
      savedAt: new Date(newest.mtimeMs).toISOString(),
    };
  } catch {
    return null;
  }
}
