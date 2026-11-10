import type { CommandModule } from 'yargs';
import { loadConfig } from '../../config/config.js';
import { runClean } from '../../clean/run.js';

export const cleanCommand: CommandModule = {
  command: 'clean',
  describe: 'Remove the regenerable dossier cache',
  handler: () => {
    loadConfig();
    runClean();
  },
};
