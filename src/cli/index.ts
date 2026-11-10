#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { setCliCacheSelection, type CacheMode } from '../config/paths.js';
import { doctorCommand } from './commands/doctor.js';
import { initCommand } from './commands/init.js';
import { pathsCommand } from './commands/paths.js';
import { proposalCommand } from './commands/proposal.js';
import { answerCommand } from './commands/answer.js';
import { tailorCommand } from './commands/tailor.js';
import { verifyCommand } from './commands/verify.js';
import { cleanCommand } from './commands/clean.js';
import { syncCommand } from './commands/sync.js';
import { scoreCommand } from './commands/score.js';

const cli = yargs(hideBin(process.argv))
  .scriptName('dossier')
  .usage('$0 <command> [options]')
  .parserConfiguration({
    'boolean-negation': false,
  })
  .option('cache-mode', {
    type: 'string',
    choices: ['auto', 'dev', 'release'] as const,
    describe: 'Cache location mode',
  })
  .option('cache-dir', {
    type: 'string',
    describe: 'Explicit cache directory (overrides cache mode)',
  })
  .option('dev', {
    type: 'boolean',
    describe: 'Use the project-local .cache (same as --cache-mode dev)',
    default: false,
  })
  .option('release', {
    type: 'boolean',
    describe: 'Use the XDG cache (same as --cache-mode release)',
    default: false,
  })
  .middleware((argv) => {
    const values = argv as {
      cacheMode?: CacheMode;
      cacheDir?: string;
      dev?: boolean;
      release?: boolean;
    };
    if (values.dev && values.release) {
      throw new Error('Use only one of --dev or --release.');
    }
    const mode = values.dev
      ? 'dev'
      : values.release
        ? 'release'
        : values.cacheMode;
    setCliCacheSelection({
      mode,
      dir: values.cacheDir,
    });
  })
  .command(initCommand)
  .command(doctorCommand)
  .command(pathsCommand)
  .command(proposalCommand)
  .command(answerCommand)
  .command(tailorCommand)
  .command(verifyCommand)
  .command(cleanCommand)
  .command(syncCommand)
  .command(scoreCommand)
  .demandCommand(1, 'Choose a command.')
  .strict()
  .help()
  .alias('h', 'help')
  .version()
  .fail((message, error) => {
    if (error) throw error;
    console.error(`dossier: ${message}`);
    process.exit(1);
  });

try {
  await cli.parseAsync();
} catch (error) {
  console.error(`dossier: ${(error as Error).message}`);
  process.exit(1);
}
