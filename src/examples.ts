import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getExamplesDir } from './config/paths.js';

/**
 * Copy the bundled example YAML files into the XDG data directory so they stay
 * in a stable, documented location instead of the versioned package path.
 */
export function installExamples(): string {
  const dir = getExamplesDir();
  mkdirSync(dir, { recursive: true });
  const source = fileURLToPath(new URL('../templates/', import.meta.url));

  for (const file of readdirSync(source)) {
    if (!file.endsWith('.yml')) continue;
    const from = join(source, file);
    const to = join(dir, file);
    const contents = readFileSync(from, 'utf8');
    if (existsSync(to) && readFileSync(to, 'utf8') === contents) continue;
    cpSync(from, to, { force: true });
  }

  return dir;
}
