import type { CommandModule } from 'yargs';
import { runProposal } from '../../proposal/run.js';

interface ProposalArgs {
  input?: string;
  out?: string;
  name?: string;
  title?: string;
  company?: string;
  url?: string;
  description?: string;
  client?: string;
  profile?: string;
  noProfile?: boolean;
  question?: string[];
  questions?: string;
  hint?: string[];
  rate?: number;
  rateType?: string;
  noRate?: boolean;
  timeline?: string;
  availability?: string;
  provider?: string;
  model?: string;
  timeout?: number;
  refresh?: boolean;
  noSync?: boolean;
  noCopy?: boolean;
  debug?: boolean;
}

export const proposalCommand: CommandModule<object, ProposalArgs> = {
  command: 'proposal [input]',
  describe: 'Write a grounded Upwork proposal for a job',
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
        describe: 'Proposal filename suffix',
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
        describe: 'Ignore profile.url from proposal.yml',
        default: false,
      })
      .option('question', {
        alias: 'q',
        type: 'string',
        array: true,
        describe: 'Screening question text or file (repeatable)',
      })
      .option('questions', {
        type: 'string',
        describe: 'File with one screening question per line',
      })
      .option('hint', {
        alias: 'H',
        type: 'string',
        array: true,
        describe: 'Positioning or tone guidance (repeatable)',
      })
      .option('rate', {
        type: 'number',
        describe: 'Hourly rate or fixed bid to use',
      })
      .option('rate-type', {
        type: 'string',
        choices: ['hourly', 'fixed'] as const,
        describe: 'Rate type',
      })
      .option('no-rate', {
        type: 'boolean',
        describe: 'Keep the rate out of the proposal text',
        default: false,
      })
      .option('timeline', {
        type: 'string',
        describe: 'Delivery timeline, e.g. "2 weeks"',
      })
      .option('availability', {
        type: 'string',
        describe: 'Availability, e.g. "20 hrs/week, UK overlap"',
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
      .option('no-sync', {
        type: 'boolean',
        describe: 'Accepted for compatibility; v0.1 has no GitHub sync',
        default: false,
      })
      .option('no-copy', {
        type: 'boolean',
        describe: 'Do not copy the proposal to the clipboard',
        default: false,
      })
      .option('debug', {
        type: 'boolean',
        describe: 'Save the prompt and raw OpenCode output',
        default: false,
      }),
  handler: async (argv) => {
    await runProposal({
      input: argv.input,
      out: argv.out,
      name: argv.name,
      title: argv.title,
      company: argv.company,
      url: argv.url,
      description: argv.description,
      client: argv.client,
      profile: argv.profile,
      noProfile: argv.noProfile,
      question: argv.question,
      questions: argv.questions,
      hint: argv.hint,
      rate: argv.rate,
      rateType: argv.rateType,
      noRate: argv.noRate,
      timeline: argv.timeline,
      availability: argv.availability,
      provider: argv.provider,
      model: argv.model,
      timeout:
        argv.timeout != null ? Number(argv.timeout) * 1000 : undefined,
      refresh: argv.refresh,
      noSync: argv.noSync,
      noCopy: argv.noCopy,
      debug: argv.debug,
    });
  },
};
