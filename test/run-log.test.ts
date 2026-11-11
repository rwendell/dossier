import { existsSync, rmSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getLogDir } from '../src/config/paths.js';
import { writeRunLog } from '../src/util/run-log.js';

describe('run logs', () => {
  it('writes diagnostics under the state directory', () => {
    const path = writeRunLog(
      '/tmp/elsewhere/resume-acme',
      '.prompt.txt',
      'hello',
    );
    expect(path.startsWith(getLogDir())).toBe(true);
    expect(path.endsWith('resume-acme.prompt.txt')).toBe(true);
    expect(existsSync(path)).toBe(true);
    rmSync(path);
  });
});
