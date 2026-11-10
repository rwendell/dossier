import { describe, expect, it } from 'vitest';
import { parseGistId } from '../src/private/pull.js';

describe('pull-private gist ids', () => {
  it('accepts an id', () => {
    expect(parseGistId('abc123def456')).toBe('abc123def456');
  });

  it('accepts a gist URL', () => {
    expect(
      parseGistId('https://gist.github.com/rwendell/abc123def456'),
    ).toBe('abc123def456');
  });

  it('rejects invalid values', () => {
    expect(() => parseGistId('not a gist')).toThrow(
      'Invalid gist id or URL',
    );
  });
});
