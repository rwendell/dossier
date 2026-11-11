import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ensureRuntimeDir,
  getAgentsDir,
} from '../config/paths.js';

export function ensureAgents(): string {
  ensureRuntimeDir();
  const agentsDir = getAgentsDir();
  const source = fileURLToPath(new URL('../../agents/', import.meta.url));
  try {
    for (const file of readdirSync(source)) {
      if (!file.endsWith('.md')) continue;
      const contents = `${source}/${file}`;
      copyIfChanged(contents, `${agentsDir}/${file}`);
    }
  } catch (error) {
    throw new Error(
      `Could not install OpenCode agents from ${source}: ${(error as Error).message}`,
    );
  }
  mkdirSync(agentsDir, { recursive: true });
  return agentsDir;
}

function copyIfChanged(source: string, target: string): void {
  if (existsSync(target) && readFileSync(target, 'utf8') === readFileSync(source, 'utf8')) {
    return;
  }
  cpSync(source, target, { force: true });
}

/**
 * New agent files are not always visible to a running OpenCode service until
 * its configuration is reloaded. `opencode reload` is the supported V2 command
 * and does not restart the service.
 */
export function reloadOpencode(): void {
  const result = spawnSync('opencode', ['reload'], {
    encoding: 'utf8',
    timeout: 15_000,
  });
  if (result.error || result.status !== 0) {
    const detail = result.error?.message || result.stderr || 'unknown error';
    console.warn(`dossier: could not reload OpenCode configuration: ${detail}`);
  }
}
