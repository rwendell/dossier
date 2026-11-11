import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CommandModule } from 'yargs';
import {
  FONT_ASSETS,
  ensureFallbackFonts,
  fallbackFontsInstalled,
  fallbackFontSize,
  getFontDir,
  isSymbolFont,
  removeFallbackFonts,
  systemSerif,
} from '../../resume/fonts.js';

interface FontsArgs {
  install?: boolean;
  force?: boolean;
  json?: boolean;
}

export const fontsCommand: CommandModule<object, FontsArgs> = {
  command: 'fonts',
  describe: 'Check or install the PDF fallback font',
  builder: (yargs) =>
    yargs
      .option('install', {
        type: 'boolean',
        describe: 'Download the fallback font if it is missing',
        default: false,
      })
      .option('force', {
        type: 'boolean',
        describe: 'Download the fallback font again',
        default: false,
      })
      .option('json', {
        type: 'boolean',
        describe: 'Print JSON',
        default: false,
      }),
  handler: async (argv) => {
    const dir = getFontDir();
    const serif = systemSerif();
    const unusable = Boolean(serif && isSymbolFont(serif));

    if (argv.force) removeFallbackFonts();
    if (argv.force || (argv.install && !fallbackFontsInstalled())) {
      await ensureFallbackFonts((message) => console.log(`dossier: ${message}`));
      console.log(`dossier: fallback font installed in ${dir}`);
    }

    const installed = fallbackFontsInstalled();
    const report = {
      systemSerif: serif,
      systemSerifUsable: serif ? !unusable : null,
      fallbackDir: dir,
      fallbackInstalled: installed,
      fallbackBytes: fallbackFontSize(),
      files: FONT_ASSETS.map((asset) => ({
        file: asset.file,
        present: existsSync(join(dir, asset.file)),
      })),
    };

    if (argv.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    console.log(
      `${'serif'.padEnd(18)} ${serif ?? 'unknown'}${unusable ? ' (symbol font)' : ''}`,
    );
    console.log(`${'fallback dir'.padEnd(18)} ${dir}`);
    console.log(
      `${'fallback font'.padEnd(18)} ${
        installed
          ? `installed (${Math.round(report.fallbackBytes / 1024)} KiB)`
          : 'not installed'
      }`,
    );
    if (unusable && !installed) {
      console.log('');
      console.log(
        'This system resolves serif text to a symbol font, so PDFs render as symbols.',
      );
      console.log('Run `dossier fonts --install` or install a serif font.');
    }
  },
};
