import { rmSync } from 'node:fs';
import { cacheDir } from '../config/paths.js';

export function runClean(): void {
  rmSync(cacheDir, { recursive: true, force: true });
  console.log(`dossier: removed ${cacheDir}`);
}
