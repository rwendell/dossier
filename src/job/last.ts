import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { getLastJobFile } from '../config/paths.js';
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
