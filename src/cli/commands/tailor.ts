import type { CommandModule } from 'yargs';
import { runTailor } from '../../resume/run.js';

interface TailorArgs {
  input?: string;
  out?: string;
  name?: string;
  title?: string;
  company?: string;
  url?: string;
  description?: string;
  generic?: boolean;
  profile?: string;
  noProfile?: boolean;
  theme?: string;
  provider?: string;
  model?: string;
  timeout?: number;
  refresh?: boolean;
  noRender?: boolean;
  open?: boolean;
  noOpen?: boolean;
  debug?: boolean;
}

export const tailorCommand: CommandModule<object, TailorArgs> = {
  command: 'tailor [input]',
  describe: 'Tailor a one-page JSON Resume and PDF for a job',
  builder: (yargs) =>
    yargs
      .positional('input', {
        type: 'string',
        describe: 'Job URL, job file, or job description',
      })
      .option('out', {
        type: 'string',
        describe: 'Output directory (default: current directory)',
      })
      .option('name', {
        type: 'string',
        describe: 'Resume filename suffix',
      })
      .option('generic', {
        type: 'boolean',
        describe: 'Build a general-purpose resume; default when no job is given',
        default: false,
      })
      .option('profile', {
        type: 'string',
        describe: 'Public Upwork profile URL for identity/location defaults',
      })
      .option('no-profile', {
        type: 'boolean',
        describe: 'Ignore profile.url from freelance.yml',
        default: false,
      })
      .option('theme', {
        type: 'string',
        describe: 'JSON Resume theme package',
      })
      .option('title', {
        type: 'string',
        describe: 'Job title override',
      })
      .option('company', {
        type: 'string',
        describe: 'Client/company override',
      })
      .option('url', {
        type: 'string',
        describe: 'Job URL when not using a positional input',
      })
      .option('description', {
        type: 'string',
        describe: 'Job description text, file, or URL',
      })
      .option('provider', {
        type: 'string',
        choices: ['auto', 'opencode', 'go', 'openrouter'] as const,
        describe: 'Model provider',
      })
      .option('model', {
        type: 'string',
        describe: 'Exact model and skip provider fallback',
      })
      .option('timeout', {
        type: 'number',
        describe: 'Per-provider timeout in seconds',
      })
      .option('refresh', {
        type: 'boolean',
        describe: 'Refresh the cached Upwork profile',
        default: false,
      })
      .option('no-render', {
        type: 'boolean',
        describe: 'Write JSON/trace only; skip PDF rendering',
        default: false,
      })
      .option('open', {
        type: 'boolean',
        describe: 'Open the rendered PDF when finished',
        default: true,
      })
      .option('no-open', {
        type: 'boolean',
        describe: 'Do not open the rendered PDF',
        default: false,
      })
      .option('debug', {
        type: 'boolean',
        describe: 'Save the prompt and raw OpenCode output',
        default: false,
      }),
  handler: async (argv) => {
    await runTailor({
      input: argv.input,
      out: argv.out,
      name: argv.name,
      title: argv.title,
      company: argv.company,
      url: argv.url,
      description: argv.description,
      generic: argv.generic,
      profile: argv.profile,
      noProfile: argv.noProfile,
      theme: argv.theme,
      provider: argv.provider,
      model: argv.model,
      timeout:
        argv.timeout != null ? Number(argv.timeout) * 1000 : undefined,
      refresh: argv.refresh,
      noRender: argv.noRender,
      open: argv.noOpen ? false : argv.open,
      debug: argv.debug,
    });
  },
};
