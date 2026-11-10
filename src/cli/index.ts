#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { doctorCommand } from './commands/doctor.js';
import { initCommand } from './commands/init.js';
import { pathsCommand } from './commands/paths.js';
import { proposalCommand } from './commands/proposal.js';
import { answerCommand } from './commands/answer.js';

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
