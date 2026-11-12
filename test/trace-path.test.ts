import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getPrecursorDir,
  getTraceDir,
  precursorPathFor,
  tracePathFor,
} from '../src/config/paths.js';
import { locateTrace } from '../src/resume/find.js';

describe('trace location', () => {
  const written: string[] = [];

  afterEach(() => {
    for (const path of written.splice(0)) rmSync(path, { force: true });
  });

  it('keys the JSON resume by name in the precursor cache', () => {
    expect(precursorPathFor('/home/someone/apps/resume-acme.pdf')).toBe(
      join(getPrecursorDir(), 'resume-acme.json'),
    );
  });

  it('keys traces by resume filename in the cache', () => {
    const path = tracePathFor('/home/someone/apps/resume-acme.json');
    expect(path).toBe(join(getTraceDir(), 'resume-acme.trace.json'));
  });

  it('prefers the cached trace over a legacy sibling', () => {
    mkdirSync(getTraceDir(), { recursive: true });
    const resumePath = join(getTraceDir(), 'resume-locate-test.json');
    const cached = tracePathFor(resumePath);
    const legacy = resumePath.replace(/\.json$/, '.trace.json');
    writeFileSync(cached, '{}');
    writeFileSync(legacy, '{}');
    written.push(cached, legacy);

    expect(locateTrace(resumePath)).toBe(cached);
  });
});
