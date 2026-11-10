#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
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
