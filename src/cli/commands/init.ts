import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import type { CommandModule } from 'yargs';
import { loadConfig } from '../../config/config.js';
import {
  careerFile,
  configFile,
  configDir,
  dataDir,
  ensureBaseDirs,
  privateCareerFile,
  proposalFile,
} from '../../config/paths.js';
import { ensureAgents } from '../../llm/agents.js';

interface InitArgs {
  from?: string;
  force?: boolean;
}

export const initCommand: CommandModule<object, InitArgs> = {
  command: 'init',
  describe: 'Create the data directory and migrate an existing json-resume repo',
  builder: (yargs) =>
    yargs
      .option('from', {
        type: 'string',
        describe: 'Path to an existing json-resume checkout to migrate',
      })
      .option('force', {
        type: 'boolean',
        describe: 'Overwrite existing dossier data files',
        default: false,
      }),
  handler: (argv) => {
    ensureBaseDirs();

    const templates = fileURLToPath(
      new URL('../../../templates/', import.meta.url),
    );

    if (argv.from) {
      const source = resolve(process.cwd(), argv.from);
      migrate(source, Boolean(argv.force));
      copyTemplate(`${templates}/career.yml`, careerFile, false);
      copyTemplate(`${templates}/proposal.yml`, proposalFile, false);
    } else {
      copyTemplate(`${templates}/career.yml`, careerFile, Boolean(argv.force));
      copyTemplate(
        `${templates}/proposal.yml`,
        proposalFile,
        Boolean(argv.force),
      );
    }

    copyTemplate(`${templates}/config.yml`, configFile, false);
    mkdirSync(configDir, { recursive: true });
    loadConfig();
    ensureAgents();

    console.log('dossier: initialized');
    console.log(`  data:   ${dataDir}`);
    console.log(`  config: ${configDir}`);
    console.log(`  career: ${careerFile}`);
    console.log(`  proposal: ${proposalFile}`);
    console.log('');
    console.log(
      `Optional: create ${privateCareerFile} for your name, contact details, and location.`,
    );
    console.log('Next: edit career.yml and proposal.yml, then run:');
    console.log("  dossier proposal 'https://www.upwork.com/jobs/...'");
  },
};

function migrate(source: string, force: boolean): void {
  const migrations: Array<[string, string]> = [
    [`${source}/data/career.yml`, careerFile],
    [`${source}/data/career.private.yml`, privateCareerFile],
    [`${source}/data/upwork.yml`, proposalFile],
  ];

  let migrated = 0;
  for (const [from, to] of migrations) {
    if (!existsSync(from)) continue;
    copyTemplate(from, to, force);
    migrated += 1;
  }

  if (migrated === 0) {
    throw new Error(
      `No data/career.yml or data/upwork.yml found under ${source}.`,
    );
  }
}

function copyTemplate(from: string, to: string, force: boolean): void {
  if (!existsSync(from)) return;
  if (existsSync(to) && !force) {
    console.log(`dossier: keeping existing ${to}`);
    return;
  }
  mkdirSync(resolve(to, '..'), { recursive: true });
  copyFileSync(from, to);
  console.log(`dossier: wrote ${to}`);
}
