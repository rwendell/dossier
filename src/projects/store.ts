import { existsSync, readFileSync } from 'node:fs';
import type { Career } from '../career/schema.js';
import {
  getGithubCacheFile,
  getLocalProjectsCacheFile,
} from '../config/paths.js';
import type { Job } from '../job/types.js';
import { allProjectCandidates, selectProjects } from './rank.js';
import type {
  GitHubData,
  LocalProjectsData,
  ProjectCandidate,
} from './types.js';

export function loadGithub(): GitHubData | null {
  return readJson<GitHubData>(getGithubCacheFile());
}

export function loadLocal(): LocalProjectsData | null {
  return readJson<LocalProjectsData>(getLocalProjectsCacheFile());
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

/**
 * Every cached project, for evidence-id validation in `dossier verify`.
 * No job is available there, so nothing is ranked or filtered by keywords.
 */
export function loadAllCandidates(career: Career): ProjectCandidate[] {
  const github = loadGithub();
  const local = loadLocal();
  if (!github && !local) return [];
  return allProjectCandidates(github, local, career);
}

export function hasProjectCache(): boolean {
  return (
    existsSync(getGithubCacheFile()) ||
    existsSync(getLocalProjectsCacheFile())
  );
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}
