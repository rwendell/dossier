import type { CommandModule } from 'yargs';
import { loadConfig } from '../../config/config.js';
import { pullPrivate } from '../../private/pull.js';

interface PullPrivateArgs {
  gist?: string;
  file?: string;
  allowPublic?: boolean;
}

export const pullPrivateCommand: CommandModule<object, PullPrivateArgs> = {
  command: 'pull-private',
  describe: 'Pull career.private.yml from a secret GitHub gist',
  builder: (yargs) =>
    yargs
      .option('gist', {
        type: 'string',
        describe: 'Gist id or URL (default: CAREER_PRIVATE_GIST_ID or auto-discover)',
      })
      .option('file', {
        type: 'string',
        describe: 'Gist filename',
        default: 'career.private.yml',
      })
      .option('allow-public', {
        type: 'boolean',
        describe: 'Permit a public gist; not recommended for PII',
        default: false,
      }),
  handler: (argv) => {
    loadConfig();
    pullPrivate({
      gist: argv.gist,
      file: argv.file,
      allowPublic: argv.allowPublic,
    });
  },
};
