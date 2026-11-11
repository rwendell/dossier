import type { CommandModule } from 'yargs';
import { runAnswer } from '../../answer/run.js';

interface AnswerArgs {
  input?: string;
  question: string;
  out?: string;
  name?: string;
  title?: string;
  company?: string;
  url?: string;
  description?: string;
  client?: string;
  profile?: string;
  noProfile?: boolean;
  hint?: string[];
  provider?: string;
  model?: string;
  timeout?: number;
  refresh?: boolean;
  noCopy?: boolean;
  debug?: boolean;
}

export const answerCommand: CommandModule<object, AnswerArgs> = {
  command: 'answer [input]',
  describe: 'Answer an application or interview question from the career dossier',
  builder: (yargs) =>
    yargs
      .positional('input', {
        type: 'string',
        describe: 'Job URL, job file, or job description',
      })
      .option('question', {
        alias: 'q',
        type: 'string',
        demandOption: true,
        describe: 'Question text or file',
      })
      .option('out', {
        type: 'string',
        describe: 'Output directory (default: current directory)',
      })
      .option('name', {
        type: 'string',
        describe: 'Answer filename suffix',
      })
      .option('client', {
        type: 'string',
        describe: 'Client context text or file',
      })
      .option('profile', {
        type: 'string',
        describe: 'Public Upwork profile URL for defaults',
      })
      .option('no-profile', {
        type: 'boolean',
        describe: 'Ignore profile.url from freelance.yml',
        default: false,
      })
      .option('hint', {
        alias: 'H',
        type: 'string',
        array: true,
        describe: 'Positioning or tone guidance (repeatable)',
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
      .option('no-copy', {
        type: 'boolean',
        describe: 'Do not copy the answer to the clipboard',
        default: false,
      })
      .option('debug', {
        type: 'boolean',
        describe: 'Save the prompt and raw OpenCode output',
        default: false,
      }),
  handler: async (argv) => {
    await runAnswer({
      input: argv.input,
      question: argv.question,
      out: argv.out,
      name: argv.name,
      title: argv.title,
      company: argv.company,
      url: argv.url,
      description: argv.description,
      client: argv.client,
      profile: argv.profile,
      noProfile: argv.noProfile,
      hint: argv.hint,
      provider: argv.provider,
      model: argv.model,
      timeout:
        argv.timeout != null ? Number(argv.timeout) * 1000 : undefined,
      refresh: argv.refresh,
      noCopy: argv.noCopy,
      debug: argv.debug,
    });
  },
};
