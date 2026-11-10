import type { CommandModule } from 'yargs';
import { runClean } from '../../clean/run.js';

export const cleanCommand: CommandModule = {
  command: 'clean',
  describe: 'Remove the regenerable dossier cache',
  handler: () => {
    runClean();
  },
};
