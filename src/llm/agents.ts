import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  agentsDir,
  ensureRuntimeDir,
  opencodeAgentsDir,
} from '../config/paths.js';

export function ensureAgents(): string {
  ensureRuntimeDir();
  mkdirSync(opencodeAgentsDir, { recursive: true });
  const source = fileURLToPath(new URL('../../agents/', import.meta.url));
  try {
    for (const file of readdirSync(source)) {
      if (!file.endsWith('.md')) continue;
      const contents = `${source}/${file}`;
      copyIfChanged(contents, `${agentsDir}/${file}`);
      copyIfChanged(contents, `${opencodeAgentsDir}/${file}`);
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
