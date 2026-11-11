import { describe, expect, it } from 'vitest';
import { opencodeEnv } from '../src/llm/env.js';

describe('opencode environment', () => {
  it('points PWD at the runtime directory', () => {
    const env = opencodeEnv('/tmp/dossier-runtime');
    expect(env.PWD).toBe('/tmp/dossier-runtime');
    expect(env.PATH).toBe(process.env.PATH);
  });
});
