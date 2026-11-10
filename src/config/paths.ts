import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import envPaths from 'env-paths';

const defaults = envPaths('dossier', { suffix: '' });

export const packageRoot = fileURLToPath(new URL('../../', import.meta.url));

const isSourceCheckout =
  existsSync(join(packageRoot, '.git')) ||
  existsSync(join(packageRoot, 'src', 'cli', 'index.ts'));

export type CacheMode = 'auto' | 'dev' | 'release';

interface CacheSelection {
  mode?: CacheMode;
  dir?: string;
}

let cliSelection: CacheSelection = {};
let configSelection: CacheSelection = {};

export function setCliCacheSelection(selection: CacheSelection): void {
  cliSelection = { ...selection };
}

export function setConfigCacheSelection(selection: CacheSelection): void {
  configSelection = { ...selection };
}

export function getCacheMode(): 'dev' | 'release' {
  const configured = cliSelection.mode ?? configSelection.mode;
  if (configured === 'dev' || configured === 'release') return configured;

  const envMode = String(process.env.DOSSIER_CACHE_MODE ?? '')
    .trim()
    .toLowerCase();
  if (envMode === 'dev' || envMode === 'release') return envMode;

  if (process.env.DOSSIER_DEV === '1') return 'dev';
  if (process.env.DOSSIER_DEV === '0') return 'release';

  return isSourceCheckout ? 'dev' : 'release';
}

export function getCacheSource(): 'cli' | 'config' | 'env' | 'auto' {
  if (cliSelection.dir || (cliSelection.mode && cliSelection.mode !== 'auto')) {
    return 'cli';
  }
  if (
    configSelection.dir ||
    (configSelection.mode && configSelection.mode !== 'auto')
  ) {
    return 'config';
  }
  if (
    process.env.DOSSIER_CACHE_HOME ||
    process.env.DOSSIER_CACHE_MODE ||
    process.env.DOSSIER_DEV
  ) {
    return 'env';
  }
  return 'auto';
}

export function getCacheDir(): string {
  const explicit =
    cliSelection.dir ||
    configSelection.dir ||
    process.env.DOSSIER_CACHE_HOME;
  if (explicit) return resolve(expandHome(explicit));
  return getCacheMode() === 'dev'
    ? join(packageRoot, '.cache')
    : defaults.cache;
}

export const dataDir = process.env.DOSSIER_DATA_HOME
  ? resolve(process.env.DOSSIER_DATA_HOME)
  : defaults.data;
export const configDir = process.env.DOSSIER_CONFIG_HOME
  ? resolve(process.env.DOSSIER_CONFIG_HOME)
  : defaults.config;
export const stateDir = process.env.DOSSIER_STATE_HOME
  ? resolve(process.env.DOSSIER_STATE_HOME)
  : defaults.log;

export const careerFile = join(dataDir, 'career.yml');
export const privateCareerFile = join(dataDir, 'career.private.yml');
export const proposalFile = join(dataDir, 'proposal.yml');
export const legacyProposalFile = join(dataDir, 'upwork.yml');
export const configFile = join(configDir, 'config.yml');

export function getRuntimeDir(): string {
  return join(getCacheDir(), 'opencode');
}

export function getAgentsDir(): string {
  return join(getRuntimeDir(), '.opencode', 'agents');
}

export function getProfileCacheDir(): string {
  return join(getCacheDir(), 'upwork');
}

export function getGithubCacheFile(): string {
  return join(getCacheDir(), 'github.json');
}

export function getLocalProjectsCacheFile(): string {
  return join(getCacheDir(), 'local-projects.json');
}

const opencodeConfigBase = process.env.XDG_CONFIG_HOME
  ? resolve(process.env.XDG_CONFIG_HOME)
  : join(homedir(), '.config');
export const opencodeConfigDir = join(opencodeConfigBase, 'opencode');
export const opencodeAgentsDir = join(opencodeConfigDir, 'agents');

export function ensureBaseDirs(): void {
  for (const dir of [dataDir, configDir, getCacheDir(), stateDir]) {
    mkdirSync(dir, { recursive: true });
  }
}

export function ensureRuntimeDir(): void {
  mkdirSync(getAgentsDir(), { recursive: true });
}

export function cacheFile(...parts: string[]): string {
  return join(getCacheDir(), ...parts);
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
