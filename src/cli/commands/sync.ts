import type { CommandModule } from 'yargs';
import { syncGithub } from '../../projects/sync-github.js';
import { syncLocal } from '../../projects/sync-local.js';

interface SyncArgs {
  target?: 'github' | 'local' | 'all';
  user?: string;
  root?: string;
  limit?: number;
  readmeChars?: number;
  publicOnly?: boolean;
  skipOrgs?: boolean;
  skipLocal?: boolean;
}

export const syncCommand: CommandModule<object, SyncArgs> = {
  command: 'sync <target>',
  describe: 'Sync GitHub/org and local project metadata into the cache',
  builder: (yargs) =>
    yargs
      .positional('target', {
        type: 'string',
        choices: ['github', 'local', 'all'] as const,
        describe: 'What to sync',
      })
      .option('user', {
        type: 'string',
        describe: 'GitHub username override',
      })
      .option('root', {
        type: 'string',
        describe: 'Local projects root (default: ~/projects)',
      })
      .option('limit', {
        type: 'number',
        describe: 'Maximum repos per GitHub owner',
      })
      .option('readme-chars', {
        type: 'number',
        describe: 'README characters to keep',
      })
      .option('public-only', {
        type: 'boolean',
        describe: 'Exclude private org repositories',
        default: false,
      })
      .option('skip-orgs', {
        type: 'boolean',
        describe: 'Only sync personal GitHub repositories',
        default: false,
      })
      .option('skip-local', {
        type: 'boolean',
        describe: 'Do not scan local projects after GitHub sync',
        default: false,
      }),
  handler: (argv) => {
    if (!argv.target) throw new Error('Choose github, local, or all.');
    if (argv.target === 'local') {
      syncLocal({
        root: argv.root,
        readmeChars: argv.readmeChars,
      });
      return;
    }

    syncGithub({
      user: argv.user,
      limit: argv.limit,
      readmeChars: argv.readmeChars,
      publicOnly: argv.publicOnly,
      skipOrgs: argv.skipOrgs,
      skipLocal: argv.target === 'github' ? argv.skipLocal : false,
    });
  },
};
