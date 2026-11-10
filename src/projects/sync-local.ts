import { execFileSync } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadCareer } from '../career/load.js';
import {
  expandHome,
  getGithubCacheFile,
  getLocalProjectsCacheFile,
} from '../config/paths.js';
import type { GitHubData, LocalProject, LocalProjectsData } from './types.js';

export interface SyncLocalOptions {
  root?: string;
  out?: string;
  readmeChars?: number;
  maxFiles?: number;
}

const DEFAULT_EXCLUDES = new Set(['dossier', 'json-resume']);

interface LocalConfig {
  root?: string;
  exclude?: string[];
  include?: string[];
}

interface Manifest {
  name: string;
  description: string;
  keywords: string[];
  languages: string[];
}

export function syncLocal(options: SyncLocalOptions = {}): LocalProjectsData {
  const { career } = loadCareer({ optional: true });
  const localConfig = (career.local ?? {}) as LocalConfig;
  const githubConfig = (career.github ?? {}) as { username?: string };
  const githubUser = githubConfig.username || '';

  const localRoot = resolve(
    expandHome(options.root || localConfig.root || join(homedir(), 'projects')),
  );
  if (!existsSync(localRoot)) {
    throw new Error(`Local project root not found: ${localRoot}`);
  }

  const outPath = resolve(
    options.out || getLocalProjectsCacheFile(),
  );
  const readmeChars = options.readmeChars ?? 5000;
  const maxFiles = options.maxFiles ?? 2500;

  const exclude = new Set(
    (localConfig.exclude ?? []).map((name) =>
      String(name).toLowerCase(),
    ),
  );
  const include = new Set(
    (localConfig.include ?? []).map((name) =>
      String(name).toLowerCase(),
    ),
  );
  const effectiveExclude = new Set(exclude);
  for (const name of include) effectiveExclude.delete(name);

  const githubPath = getGithubCacheFile();
  const github = existsSync(githubPath)
    ? (JSON.parse(readFileSync(githubPath, 'utf8')) as GitHubData)
    : { repos: [], orgs: [] };
  const githubFullNames = new Set(
    (github.repos ?? []).map((repo) =>
      String(repo.fullName || repo.name).toLowerCase(),
    ),
  );
  const gitEmail = gitConfig('user.email');
  const gitName = gitConfig('user.name');
  const authorArgs = [
    ...new Set(
      [gitEmail, githubUser ? `${githubUser}@users.noreply.github.com` : '']
        .filter(Boolean)
        .flatMap((email) => [`--author=${email}`]),
    ),
  ];
  if (gitName) authorArgs.push(`--author=${gitName}`);

  console.log(`dossier: scanning ${localRoot}`);

  const projects: LocalProject[] = [];
  for (const entry of readdirSync(localRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;
    const normalizedName = entry.name.toLowerCase();
    if (
      !include.has(normalizedName) &&
      (effectiveExclude.has(normalizedName) ||
        DEFAULT_EXCLUDES.has(normalizedName))
    ) {
      continue;
    }

    const fullPath = join(localRoot, entry.name);
    if (!existsSync(fullPath)) continue;
    const project = inspectProject(entry.name, fullPath, {
      readmeChars,
      maxFiles,
      exclude: effectiveExclude,
      include,
      githubFullNames,
      authorArgs,
    });
    if (project) projects.push(project);
  }

  projects.sort((a, b) => {
    if (a.included !== b.included) return a.included ? -1 : 1;
    return String(b.lastCommit).localeCompare(String(a.lastCommit));
  });

  const output: LocalProjectsData = {
    root: localRoot,
    syncedAt: new Date().toISOString(),
    projects,
  };
  writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(
    `dossier: wrote ${projects.length} local project(s) (${projects.filter((project) => project.included).length} eligible) to ${outPath}`,
  );
  return output;
}

function inspectProject(
  name: string,
  fullPath: string,
  context: {
    readmeChars: number;
    maxFiles: number;
    exclude: Set<string>;
    include: Set<string>;
    githubFullNames: Set<string>;
    authorArgs: string[];
  },
): LocalProject | null {
  if (!existsSync(join(fullPath, '.git'))) return null;

  const readme = readReadme(fullPath).slice(0, context.readmeChars);
  const manifest = readManifest(fullPath);
  const languages = detectLanguages(fullPath, manifest, context.maxFiles);
  const description =
    manifest.description || descriptionFromReadme(readme) || '';
  const displayName = firstHeading(readme) || manifest.name || name;
  const remote = git(fullPath, ['remote', 'get-url', 'origin']);
  const remoteFullName = parseGithubRemote(remote);
  const userCommits = git(fullPath, [
    'log',
    ...context.authorArgs,
    '--format=%s',
    '-10',
  ])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const userCommitCount =
    Number(git(fullPath, ['rev-list', '--count', ...context.authorArgs, 'HEAD'])) ||
    0;
  const lastCommit =
    git(fullPath, ['log', '-1', '--format=%cI']) ||
    statSync(fullPath).mtime.toISOString();

  const reasons: string[] = [];
  if (context.exclude.has(name.toLowerCase())) {
    reasons.push('excluded in career.yml or career.private.yml');
  }
  if (!readme && !description && languages.length === 0) {
    reasons.push('no README or project manifest');
  }
  if (
    remoteFullName &&
    context.githubFullNames.has(remoteFullName.toLowerCase())
  ) {
    reasons.push('already tracked via GitHub');
  }
  if (
    remoteFullName &&
    !context.githubFullNames.has(remoteFullName.toLowerCase()) &&
    userCommitCount === 0 &&
    !context.include.has(name.toLowerCase())
  ) {
    reasons.push('upstream clone with no local commits');
  }

  return {
    name,
    displayName,
    source: 'local',
    evidence: `local:${name}`,
    path: fullPath,
    remote: remote || '',
    remoteFullName,
    url: remoteFullName ? `https://github.com/${remoteFullName}` : '',
    description,
    languages,
    topics: manifest.keywords,
    readme,
    localCommits: userCommits,
    userCommitCount,
    lastCommit,
    included: reasons.length === 0,
    reasons,
  };
}

function readReadme(fullPath: string): string {
  for (const name of ['README.md', 'readme.md', 'README', 'README.txt']) {
    const file = join(fullPath, name);
    if (existsSync(file) && statSync(file).isFile()) {
      return cleanReadme(readFileSync(file, 'utf8'));
    }
  }
  return '';
}

function readManifest(fullPath: string): Manifest {
  const result: Manifest = {
    name: '',
    description: '',
    keywords: [],
    languages: [],
  };
  const packagePath = join(fullPath, 'package.json');
  if (existsSync(packagePath)) {
    try {
      const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as {
        name?: string;
        description?: string;
        keywords?: string[];
      };
      result.name = pkg.name || '';
      result.description = pkg.description || '';
      result.keywords = Array.isArray(pkg.keywords) ? pkg.keywords : [];
      result.languages.push(
        existsSync(join(fullPath, 'tsconfig.json'))
          ? 'TypeScript'
          : 'JavaScript',
      );
    } catch {
      // Ignore malformed manifests.
    }
  }

  const manifests: Array<[string, string]> = [
    ['go.mod', 'Go'],
    ['Cargo.toml', 'Rust'],
    ['pyproject.toml', 'Python'],
    ['requirements.txt', 'Python'],
    ['Gemfile', 'Ruby'],
    ['pom.xml', 'Java'],
    ['build.gradle', 'Java'],
    ['build.gradle.kts', 'Kotlin'],
    ['flake.nix', 'Nix'],
    ['project.godot', 'GDScript'],
  ];
  for (const [file, language] of manifests) {
    if (existsSync(join(fullPath, file))) result.languages.push(language);
  }

  for (const entry of readdirSync(fullPath, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.csproj')) {
      result.languages.push('C#');
    }
  }

  result.languages = [...new Set(result.languages)];
  return result;
}

function detectLanguages(
  fullPath: string,
  manifest: Manifest,
  maxFiles: number,
): string[] {
  const counts = new Map<string, number>();
  const extensions: Record<string, string> = {
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript',
    '.js': 'JavaScript',
    '.jsx': 'JavaScript',
    '.svelte': 'Svelte',
    '.vue': 'Vue',
    '.go': 'Go',
    '.rs': 'Rust',
    '.py': 'Python',
    '.kt': 'Kotlin',
    '.java': 'Java',
    '.cs': 'C#',
    '.rb': 'Ruby',
    '.nix': 'Nix',
    '.gd': 'GDScript',
    '.lua': 'Lua',
    '.c': 'C',
    '.cpp': 'C++',
  };
  let files = 0;

  walk(fullPath, 0);
  function walk(dir: string, depth: number): void {
    if (depth > 3 || files >= maxFiles) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files >= maxFiles) return;
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      if (entry.name === 'dist' || entry.name === 'build') continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path, depth + 1);
      } else if (entry.isFile()) {
        files += 1;
        const ext = entry.name.slice(entry.name.lastIndexOf('.'));
        const language = extensions[ext.toLowerCase()];
        if (language) {
          counts.set(language, (counts.get(language) ?? 0) + 1);
        }
      }
    }
  }

  const detected = [...counts.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([language]) => language);

  return [...new Set([...manifest.languages, ...detected])];
}

function descriptionFromReadme(text: string): string {
  for (const line of text.split('\n')) {
    const value = line.trim();
    if (!value) continue;
    if (
      value.startsWith('#') ||
      value.startsWith('<') ||
      value.startsWith('!') ||
      value.startsWith('[') ||
      value.startsWith('|') ||
      value.startsWith('```') ||
      value.startsWith('---')
    ) {
      continue;
    }
    return value
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*_`]/g, '')
      .slice(0, 240);
  }
  return '';
}

function firstHeading(text: string): string {
  const match = text.match(/^#\s+(.+)$/m);
  return match ? match[1]!.replace(/[*_`]/g, '').trim() : '';
}

function parseGithubRemote(remote: string): string {
  const match = String(remote).match(
    /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/i,
  );
  return match ? `${match[1]}/${match[2]}` : '';
}

function git(cwd: string, args: string[]): string {
  try {
    return execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 5 * 1024 * 1024,
    }).trim();
  } catch {
    return '';
  }
}

function gitConfig(key: string): string {
  try {
    return execFileSync('git', ['config', '--global', key], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
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
