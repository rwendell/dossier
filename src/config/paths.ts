import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import envPaths from 'env-paths';

const defaults = envPaths('dossier', { suffix: '' });

export const packageRoot = fileURLToPath(new URL('../../', import.meta.url));

/**
 * A source checkout (including `node dist/cli/index.js` inside the repo) uses
 * the project-local .cache. A published/installed package has no .git or src/
 * and uses the XDG cache. DOSSIER_DEV=1|0 forces either mode.
 */
export const isDev =
  process.env.DOSSIER_DEV === '1' ||
  (process.env.DOSSIER_DEV !== '0' &&
    (existsSync(join(packageRoot, '.git')) ||
      existsSync(join(packageRoot, 'src', 'cli', 'index.ts'))));

export const dataDir = process.env.DOSSIER_DATA_HOME
  ? resolve(process.env.DOSSIER_DATA_HOME)
  : defaults.data;
export const configDir = process.env.DOSSIER_CONFIG_HOME
  ? resolve(process.env.DOSSIER_CONFIG_HOME)
  : defaults.config;
export const cacheDir = process.env.DOSSIER_CACHE_HOME
  ? resolve(process.env.DOSSIER_CACHE_HOME)
  : isDev
    ? join(packageRoot, '.cache')
    : defaults.cache;
export const stateDir = process.env.DOSSIER_STATE_HOME
  ? resolve(process.env.DOSSIER_STATE_HOME)
  : defaults.log;

export const careerFile = join(dataDir, 'career.yml');
export const privateCareerFile = join(dataDir, 'career.private.yml');
export const proposalFile = join(dataDir, 'proposal.yml');
export const legacyProposalFile = join(dataDir, 'upwork.yml');
export const configFile = join(configDir, 'config.yml');

export const runtimeDir = join(cacheDir, 'opencode');
export const agentsDir = join(runtimeDir, '.opencode', 'agents');
export const profileCacheDir = join(cacheDir, 'upwork');
export const githubCacheFile = join(cacheDir, 'github.json');
export const localProjectsCacheFile = join(
  cacheDir,
  'local-projects.json',
);

const opencodeConfigBase = process.env.XDG_CONFIG_HOME
  ? resolve(process.env.XDG_CONFIG_HOME)
  : join(homedir(), '.config');
export const opencodeConfigDir = join(opencodeConfigBase, 'opencode');
export const opencodeAgentsDir = join(opencodeConfigDir, 'agents');

export function ensureBaseDirs(): void {
  for (const dir of [dataDir, configDir, cacheDir, stateDir]) {
    mkdirSync(dir, { recursive: true });
  }
}

export function ensureRuntimeDir(): void {
  mkdirSync(agentsDir, { recursive: true });
}

export function cacheFile(...parts: string[]): string {
  return join(cacheDir, ...parts);
}

export function expandHome(value: string): string {
  const text = String(value ?? '').trim();
  if (text === '~') return homedir();
  if (text.startsWith('~/')) return join(homedir(), text.slice(2));
  return text;
}

export function resolveOutputDir(
  configured: string | undefined,
  flag: string | undefined,
  cwd = process.cwd(),
): string {
  const value = flag ?? configured ?? '';
  if (!value.trim()) return cwd;
  const expanded = expandHome(value);
  return isAbsolute(expanded) ? expanded : resolve(cwd, expanded);
}

export function displayPath(path: string, cwd = process.cwd()): string {
  if (path === cwd) return '.';
  if (path.startsWith(`${cwd}/`)) return `.${path.slice(cwd.length)}`;
  return path;
}
