import { describe, expect, it } from 'vitest';
import { dataFiles } from '../src/private/pull.js';

describe('pull-private targets', () => {
  it('only pulls YAML data files', () => {
    const files = dataFiles();
    expect(files.map((file) => file.name)).toEqual([
      'career.private.yml',
      'career.yml',
      'freelance.yml',
      'config.yml',
    ]);
    for (const file of files) {
      expect(file.name.endsWith('.yml')).toBe(true);
    }
  });
});
