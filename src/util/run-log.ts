import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { getLogDir } from '../config/paths.js';

/**
 * Write a diagnostic artifact (raw model output, prompt) to the XDG state
 * directory instead of the output directory. Outputs belong wherever the user
 * asked; logs do not belong in their working directory.
 */
export function writeRunLog(
  base: string,
  suffix: string,
  contents: string,
): string {
  const dir = getLogDir();
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${basename(base)}${suffix}`);
  writeFileSync(path, contents, { mode: 0o600 });
  return path;
}
