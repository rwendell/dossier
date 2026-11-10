import type { CommandModule } from 'yargs';
import { runVerify } from '../../verify/run.js';

interface VerifyArgs {
  input?: string;
}

export const verifyCommand: CommandModule<object, VerifyArgs> = {
  command: 'verify <input>',
  describe: 'Verify a generated resume JSON/trace and PDF page count',
  builder: (yargs) =>
    yargs.positional('input', {
      type: 'string',
      describe: 'Resume JSON/PDF path or resume slug',
    }),
  handler: async (argv) => {
    if (!argv.input) throw new Error('Provide a resume to verify.');
    await runVerify({ input: argv.input });
  },
};
