import type { CommandModule } from 'yargs';
import { loadCareer } from '../../career/load.js';
import { readJobInput } from '../../job/input.js';
import { rankProjects } from '../../projects/rank.js';
import { loadGithub, loadLocal } from '../../projects/store.js';

interface ScoreArgs {
  input?: string;
  title?: string;
  company?: string;
  url?: string;
  description?: string;
  limit?: number;
}

export const scoreCommand: CommandModule<object, ScoreArgs> = {
  command: 'score [input]',
  describe: 'Explain project candidate scores for a job',
  builder: (yargs) =>
    yargs
      .positional('input', {
        type: 'string',
        describe: 'Job URL, job file, or job description',
      })
      .option('title', { type: 'string', describe: 'Job title override' })
      .option('company', {
        type: 'string',
        describe: 'Client/company override',
      })
      .option('url', { type: 'string', describe: 'Job URL' })
      .option('description', {
        type: 'string',
        describe: 'Job description text, file, or URL',
      })
      .option('limit', {
        type: 'number',
        describe: 'Number of candidates to show',
        default: 12,
      }),
  handler: async (argv) => {
    const { career } = loadCareer();
    const job = await readJobInput({
      input: argv.input,
      title: argv.title,
      company: argv.company,
      url: argv.url,
      description: argv.description,
    });
    const github = loadGithub();
    const local = loadLocal();
    if (!github && !local) {
      throw new Error(
        'No project metadata cached. Run `dossier sync github` or `dossier sync local` first.',
      );
    }

    const result = rankProjects(
      github,
      local,
      career,
      job,
      argv.limit ?? 12,
    );
    console.log(`dossier: ${result.tokens.length} job keyword(s)`);
    console.log(`dossier: ${result.scored.length} project candidate(s)`);
    console.log('');
    for (const entry of result.scored.slice(0, argv.limit ?? 12)) {
      const repo = entry.repo;
      const evidence =
        repo.evidence ||
        ('fullName' in repo && repo.fullName
          ? `github:${repo.fullName}`
          : `github:${repo.name}`);
      console.log(
        `${String(entry.score).padStart(3)}  ${evidence}  ${
          entry.matched.length > 0 ? entry.matched.join(', ') : '(no keyword matches)'
        }`,
      );
    }
  },
};
