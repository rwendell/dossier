import { afterEach, describe, expect, it } from 'vitest';
import {
  getCacheDir,
  getCacheMode,
  getCacheSource,
  setCliCacheSelection,
  setConfigCacheSelection,
} from '../src/config/paths.js';

afterEach(() => {
  setCliCacheSelection({});
  setConfigCacheSelection({});
});

describe('cache configuration precedence', () => {
  it('uses config mode when no CLI override exists', () => {
    setConfigCacheSelection({ mode: 'release', dir: '' });
    expect(getCacheMode()).toBe('release');
    expect(getCacheSource()).toBe('config');
    expect(getCacheDir()).toContain('.cache');
  });

  it('lets CLI mode override config', () => {
    setConfigCacheSelection({ mode: 'release', dir: '' });
    setCliCacheSelection({ mode: 'dev' });
    expect(getCacheMode()).toBe('dev');
    expect(getCacheSource()).toBe('cli');
    expect(getCacheDir()).toContain('/.cache');
  });

  it('lets an explicit cache directory override mode', () => {
    setConfigCacheSelection({ mode: 'release', dir: '' });
    setCliCacheSelection({ dir: '/tmp/dossier-cache-test' });
    expect(getCacheDir()).toBe('/tmp/dossier-cache-test');
    expect(getCacheSource()).toBe('cli');
  });
});
