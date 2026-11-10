import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadCareer } from '../career/load.js';
import { getGithubCacheFile } from '../config/paths.js';
import { syncLocal } from './sync-local.js';
import type { GitHubData, GitHubRepo } from './types.js';

export interface SyncGithubOptions {
  user?: string;
  out?: string;
  limit?: number;
  readmeChars?: number;
  publicOnly?: boolean;
  skipOrgs?: boolean;
  skipLocal?: boolean;
}

interface GhRepo {
  name: string;
  nameWithOwner?: string;
  owner?: { login?: string };
  description?: string;
  isFork?: boolean;
  isArchived?: boolean;
  isPrivate?: boolean;
  primaryLanguage?: { name?: string };
  repositoryTopics?: Array<{ name?: string }>;
  pushedAt?: string;
  createdAt?: string;
  url?: string;
  homepageUrl?: string;
  stargazerCount?: number;
}

const JSON_FIELDS =
  'name,nameWithOwner,owner,description,isFork,isArchived,isPrivate,primaryLanguage,repositoryTopics,pushedAt,createdAt,url,homepageUrl,stargazerCount';

export function syncGithub(options: SyncGithubOptions = {}): GitHubData {
  const { career } = loadCareer({ optional: true });
  const githubConfig = (career.github ?? {}) as {
    username?: string;
    exclude?: string[];
  };

  const user = options.user || githubConfig.username || '';
  if (!user) {
    throw new Error(
      'No GitHub username. Pass --user <login> or set github.username in career.yml.',
    );
  }

  const outPath = resolve(options.out || getGithubCacheFile());
  const limit = options.limit ?? 100;
  const readmeChars = options.readmeChars ?? 5000;
  const excluded = new Set(
    (githubConfig.exclude ?? []).map((name) =>
      String(name).toLowerCase(),
    ),
  );

  console.log(`dossier: syncing GitHub repositories for ${user}`);

  let pinned: string[] = [];
  try {
    const query = `
      query($login: String!) {
        user(login: $login) {
          pinnedItems(first: 6, types: REPOSITORY) {
            nodes { ... on Repository { name } }
          }
        }
      }
    `;
    const result = ghJson<{
      data?: {
        user?: {
          pinnedItems?: { nodes?: Array<{ name?: string }> };
        };
      };
    }>(['api', 'graphql', '-f', `query=${query}`, '-f', `login=${user}`]);
    pinned = (result?.data?.user?.pinnedItems?.nodes ?? [])
      .map((repo) => repo.name ?? '')
      .filter(Boolean);
  } catch {
    console.warn('dossier: could not fetch pinned repositories; continuing');
  }

  const personalRepos = listRepos(user, limit).filter(
    (repo) => !repo.isFork && !repo.isArchived && !repo.isPrivate,
  );

  const orgs = options.skipOrgs ? [] : getOrgs();
  const orgRepos: GhRepo[] = [];

  for (const org of orgs) {
    const contributed = getContributedRepos(org, user);
    if (contributed.size === 0) continue;

    const listed = listRepos(org, limit).filter((repo) => {
      if (repo.isFork || repo.isArchived) return false;
      if (options.publicOnly && repo.isPrivate) return false;
      return contributed.has(
        String(repo.nameWithOwner ?? '').toLowerCase(),
      );
    });

    if (listed.length > 0) {
      console.log(
        `dossier: ${org} — ${listed.length} contributed repo(s)${
          listed.some((repo) => repo.isPrivate)
            ? ' (includes private)'
            : ''
        }`,
      );
    }
    orgRepos.push(...listed);
  }

  const allRepos = [
    ...personalRepos.map((repo) => ({ repo, source: 'github' as const })),
    ...orgRepos.map((repo) => ({ repo, source: 'org' as const })),
  ];

  const seen = new Set<string>();
  const synced: GitHubRepo[] = [];

  for (const { repo, source } of allRepos) {
    const fullName =
      repo.nameWithOwner ||
      `${repo.owner?.login ?? user}/${repo.name}`;
    const key = fullName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const reasons: string[] = [];
    if (
      excluded.has(repo.name.toLowerCase()) ||
      excluded.has(fullName.toLowerCase())
    ) {
      reasons.push('excluded in career.yml or career.private.yml');
    }

    let readme = '';
    try {
      const encoded = gh([
        'api',
        `repos/${fullName}/readme`,
        '--jq',
        '.content',
      ]);
      readme = Buffer.from(encoded, 'base64').toString('utf8');
    } catch {
      reasons.push('no README');
    }

    let languages: Record<string, number> = {};
    try {
      languages =
        ghJson<Record<string, number>>([
          'api',
          `repos/${fullName}/languages`,
        ]) ?? {};
    } catch {
      // Language metadata is optional.
    }

    readme = cleanReadme(readme).slice(0, readmeChars);

    if (!readme && !repo.description) {
      reasons.push('no README or description');
    }

    const owner = repo.owner?.login || fullName.split('/')[0]!;
    synced.push({
      name: repo.name,
      fullName,
      owner,
      source,
      visibility: repo.isPrivate ? 'private' : 'public',
      evidence:
        source === 'org' ? `github:${fullName}` : `github:${repo.name}`,
      url: repo.url,
      homepage: repo.homepageUrl || '',
      description: repo.description || '',
      topics: (repo.repositoryTopics ?? [])
        .map((topic) => topic.name ?? '')
        .filter(Boolean),
      languages: Object.entries(languages)
        .sort(([, a], [, b]) => b - a)
        .map(([name]) => name),
      stars: repo.stargazerCount ?? 0,
      pushedAt: repo.pushedAt,
      createdAt: repo.createdAt,
      pinned: source === 'github' && pinned.includes(repo.name),
      included: reasons.length === 0,
      reasons,
      readme,
    });
  }

  synced.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.included !== b.included) return a.included ? -1 : 1;
    return String(b.pushedAt).localeCompare(String(a.pushedAt));
  });

  const output: GitHubData = {
    owner: user,
    syncedAt: new Date().toISOString(),
    orgs,
    pinned,
    repos: synced,
  };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(
    `dossier: wrote ${synced.length} repos (${synced.filter((repo) => repo.included).length} eligible; ${orgRepos.length} from orgs) to ${outPath}`,
  );

  if (!options.skipLocal) {
    try {
      syncLocal();
    } catch (error) {
      console.warn(
        `dossier: local project sync failed; continuing: ${(error as Error).message}`,
      );
    }
  }

  return output;
}

function gh(args: string[]): string {
  try {
    return execFileSync('gh', args, {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        'GitHub CLI (`gh`) not found. Install it from https://cli.github.com and run `gh auth login`.',
      );
    }
    throw error;
  }
}

function ghJson<T>(args: string[]): T | null {
  const output = gh(args);
  return output ? (JSON.parse(output) as T) : null;
}

function listRepos(owner: string, limit: number): GhRepo[] {
  try {
    return (
      ghJson<GhRepo[]>([
        'repo',
        'list',
        owner,
        '--limit',
        String(limit),
        '--json',
        JSON_FIELDS,
      ]) ?? []
    );
  } catch (error) {
    console.error(
      `dossier: could not list repositories for ${owner}: ${(error as Error).message}`,
    );
    return [];
  }
}

function getOrgs(): string[] {
  try {
    const output = gh([
      'api',
      'user/orgs',
      '--paginate',
      '--jq',
      '.[].login',
    ]);
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    console.warn(
      `dossier: could not list organizations: ${(error as Error).message}`,
    );
    return [];
  }
}

function getContributedRepos(org: string, login: string): Set<string> {
  const repos = new Set<string>();

  try {
    const output = gh([
      'api',
      '-X',
      'GET',
      'search/commits',
      '-f',
      `q=author:${login} org:${org}`,
      '--paginate',
      '--jq',
      '.items[].repository.full_name',
    ]);
    for (const name of output.split('\n')) {
      if (name.trim()) repos.add(name.trim().toLowerCase());
    }
  } catch {
    // Search can fail on permissions or rate limits; try PRs next.
  }

  try {
    const output = gh([
      'api',
      '-X',
      'GET',
      'search/issues',
      '-f',
      `q=author:${login} org:${org} type:pr`,
      '--paginate',
      '--jq',
      '.items[].repository_url',
    ]);
    for (const url of output.split('\n')) {
      const match = url.trim().match(/repos\/([^/]+\/[^/]+)$/);
      if (match) repos.add(match[1]!.toLowerCase());
    }
  } catch {
    // PR search is optional.
  }

  return repos;
}

function cleanReadme(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
