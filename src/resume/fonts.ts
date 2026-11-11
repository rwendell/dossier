import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getCacheDir } from '../config/paths.js';

/**
 * Fallback fonts are not shipped with the package. When a theme asks for a font
 * this machine cannot provide (fontconfig can resolve even "serif" to a symbol
 * font on minimal Linux images), dossier downloads a metric-compatible serif
 * into its cache and points the PDF renderer at it.
 */

const FAMILY = 'Dossier Serif';
const SOURCE = 'https://raw.githubusercontent.com/google/fonts/main/ofl/tinos';

export interface FontAsset {
  file: string;
  style: 'normal' | 'italic';
  weight: number;
}

export const FONT_ASSETS: FontAsset[] = [
  { file: 'Tinos-Regular.ttf', style: 'normal', weight: 400 },
  { file: 'Tinos-Italic.ttf', style: 'italic', weight: 400 },
  { file: 'Tinos-Bold.ttf', style: 'normal', weight: 700 },
];

export interface FontOverride {
  css: string;
  requested: string;
  resolved: string;
}

export function getFontDir(): string {
  return join(getCacheDir(), 'fonts');
}

export function parseFontStack(stack: string): string[] {
  return stack
    .split(',')
    .map((part) => part.trim().replace(/^["']|["']$/g, '').trim())
    .filter(Boolean);
}

export function isSymbolFont(family: string): boolean {
  return /symbol|dingbat/i.test(family);
}

/** Resolve a family name through fontconfig. Linux only; elsewhere assume OK. */
export function resolveFontFamily(family: string): string | null {
  if (process.platform !== 'linux' || !family) return null;
  const result = spawnSync('fc-match', ['-f', '%{family}', family], {
    encoding: 'utf8',
    timeout: 5_000,
  });
  if (result.error || result.status !== 0) return null;
  const resolved = (result.stdout ?? '').trim();
  return resolved || null;
}

export function systemSerif(): string | null {
  return resolveFontFamily('serif');
}

export function fallbackFontsInstalled(): boolean {
  return FONT_ASSETS.every((asset) =>
    existsSync(join(getFontDir(), asset.file)),
  );
}

/**
 * Download the fallback serif on first use. Returns the font directory.
 */
export async function ensureFallbackFonts(
  log: (message: string) => void = () => {},
): Promise<string> {
  const dir = getFontDir();
  if (fallbackFontsInstalled()) return dir;

  mkdirSync(dir, { recursive: true });
  const missing = FONT_ASSETS.filter(
    (asset) => !existsSync(join(dir, asset.file)),
  );
  log(
    `downloading fallback font (${missing.map((asset) => asset.file).join(', ')}) from Google Fonts`,
  );

  for (const asset of missing) {
    const target = join(dir, asset.file);
    const response = await fetch(`${SOURCE}/${asset.file}`, {
      redirect: 'follow',
    });
    if (!response.ok) {
      throw new Error(
        `could not download ${asset.file}: HTTP ${response.status}. Install a serif font instead, e.g. fonts-liberation on Debian/Ubuntu.`,
      );
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!isTrueType(bytes)) {
      throw new Error(`${asset.file} is not a TrueType font`);
    }
    const temp = `${target}.part`;
    writeFileSync(temp, bytes);
    renameSync(temp, target);
  }

  return dir;
}

export function removeFallbackFonts(): void {
  rmSync(getFontDir(), { recursive: true, force: true });
}

function isTrueType(bytes: Buffer): boolean {
  if (bytes.length < 1024) return false;
  const tag = bytes.subarray(0, 4).toString('latin1');
  return tag === '\u0000\u0001\u0000\u0000' || tag === 'true' || tag === 'ttcf';
}

export function fallbackFontCss(): string | null {
  const dir = getFontDir();
  if (!FONT_ASSETS.every((asset) => existsSync(join(dir, asset.file)))) {
    return null;
  }
  const faces = FONT_ASSETS.map((asset) => {
    const url = pathToFileURL(join(dir, asset.file)).href;
    return `@font-face{font-family:'${FAMILY}';font-style:${asset.style};font-weight:${asset.weight};src:url('${url}') format('truetype');}`;
  });
  faces.push(
    `html,body{font-family:'${FAMILY}','Tinos','Liberation Serif','DejaVu Serif',Georgia,serif !important}`,
  );
  return faces.join('\n');
}

/**
 * Decide whether the rendered document needs a font override. A theme font is
 * unusable when fontconfig resolves it to a symbol font, which renders text as
 * Greek/symbol glyphs instead of Latin letterforms.
 */
export async function resolveFontOverride(
  themeStack: string,
  log: (message: string) => void = () => {},
): Promise<FontOverride | null> {
  const requested = parseFontStack(themeStack)[0];
  if (!requested) return null;

  const resolved =
    resolveFontFamily(requested) ?? resolveFontFamily('serif') ?? '';
  if (!resolved || !isSymbolFont(resolved)) return null;

  await ensureFallbackFonts(log);
  const css = fallbackFontCss();
  if (!css) {
    throw new Error(
      `The theme font "${requested}" resolves to "${resolved}", which renders symbols instead of text, and the fallback font is unavailable. Install a serif font, e.g. fonts-liberation on Debian/Ubuntu.`,
    );
  }
  return { css, requested, resolved };
}

export function fallbackFontSize(): number {
  return FONT_ASSETS.reduce((total, asset) => {
    const path = join(getFontDir(), asset.file);
    return total + (existsSync(path) ? statSync(path).size : 0);
  }, 0);
}
