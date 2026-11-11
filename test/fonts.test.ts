import { describe, expect, it } from 'vitest';
import {
  isSymbolFont,
  parseFontStack,
} from '../src/resume/fonts.js';

describe('font handling', () => {
  it('parses a theme font stack', () => {
    expect(parseFontStack('"Times New Roman", Times, serif')).toEqual([
      'Times New Roman',
      'Times',
      'serif',
    ]);
    expect(parseFontStack("'Noto Sans', sans-serif")).toEqual([
      'Noto Sans',
      'sans-serif',
    ]);
  });

  it('recognises symbol fonts', () => {
    expect(isSymbolFont('Standard Symbols PS')).toBe(true);
    expect(isSymbolFont('StandardSymbolsPS')).toBe(true);
    expect(isSymbolFont('Noto Sans')).toBe(false);
    expect(isSymbolFont('Liberation Serif')).toBe(false);
  });
});
