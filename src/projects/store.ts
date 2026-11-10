import { existsSync, readFileSync } from 'node:fs';
import type { Career } from '../career/schema.js';
import {
  githubCacheFile,
  localProjectsCacheFile,
} from '../config/paths.js';
import type { Job } from '../job/types.js';
import { selectProjects } from './rank.js';
import type {
  GitHubData,
  LocalProjectsData,
  ProjectCandidate,
} from './types.js';

export function loadGithub(): GitHubData | null {
  return readJson<GitHubData>(githubCacheFile);
}

export function loadLocal(): LocalProjectsData | null {
  return readJson<LocalProjectsData>(localProjectsCacheFile);
}

export function loadCandidates(
  career: Career,
  job: Job,
  limit = 12,
): ProjectCandidate[] {
  const github = loadGithub();
  const local = loadLocal();
  if (!github && !local) return [];
  return selectProjects(github, local, career, job, limit);
}

export function hasProjectCache(): boolean {
  return existsSync(githubCacheFile) || existsSync(localProjectsCacheFile);
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}
