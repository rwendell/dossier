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
import { opencodeEnv } from './env.js';

export interface EnsuredAgents {
  dir: string;
  changed: boolean;
}

export function ensureAgents(): EnsuredAgents {
  ensureRuntimeDir();
  const agentsDir = getAgentsDir();
  const source = fileURLToPath(new URL('../../agents/', import.meta.url));
  let changed = false;
  try {
    for (const file of readdirSync(source)) {
      if (!file.endsWith('.md')) continue;
      const contents = `${source}/${file}`;
      if (copyIfChanged(contents, `${agentsDir}/${file}`)) changed = true;
    }
  } catch (error) {
    throw new Error(
      `Could not install OpenCode agents from ${source}: ${(error as Error).message}`,
    );
  }
  mkdirSync(agentsDir, { recursive: true });
  return { dir: agentsDir, changed };
}

/**
 * Install the agent prompts and make sure the running OpenCode service sees
 * them. The service caches a project's agent list after it first loads that
 * directory, so newly written files need a reload to appear.
 */
export function prepareAgents(): string {
  const { dir, changed } = ensureAgents();
  if (changed) reloadOpencode(dir);
  return dir;
}

function copyIfChanged(source: string, target: string): boolean {
  if (
    existsSync(target) &&
    readFileSync(target, 'utf8') === readFileSync(source, 'utf8')
  ) {
    return false;
  }
  cpSync(source, target, { force: true });
  return true;
}

/**
 * New agent files are not always visible to a running OpenCode service until
 * its configuration is reloaded. `opencode reload` is the supported V2 command
 * and does not restart the service. It must run in the runtime directory,
 * otherwise it reloads the user's current project instead.
 */
export function reloadOpencode(cwd: string): boolean {
  const result = spawnSync('opencode', ['reload'], {
    cwd,
    env: opencodeEnv(cwd),
    encoding: 'utf8',
    timeout: 15_000,
  });
  return !result.error && result.status === 0;
}
