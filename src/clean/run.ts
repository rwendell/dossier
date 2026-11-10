import { rmSync } from 'node:fs';
import { getCacheDir } from '../config/paths.js';

export function runClean(): void {
  const cacheDir = getCacheDir();
  rmSync(cacheDir, { recursive: true, force: true });
  console.log(`dossier: removed ${cacheDir}`);
}
