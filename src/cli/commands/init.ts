import {
  copyFileSync,
  existsSync,
  mkdirSync,
  statSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import type { CommandModule } from 'yargs';
import { importJsonResume } from '../../career/import-resume.js';
import { loadConfig } from '../../config/config.js';
import {
  careerFile,
  configFile,
  configDir,
  dataDir,
  ensureBaseDirs,
  freelanceFile,
  legacyProposalFile,
  legacyUpworkFile,
  privateCareerFile,
} from '../../config/paths.js';
import { installExamples } from '../../examples.js';
import { ensureAgents } from '../../llm/agents.js';

interface InitArgs {
  from?: string;
  force?: boolean;
}

export const initCommand: CommandModule<object, InitArgs> = {
  command: 'init',
  describe: 'Create the data directory and import career data',
  builder: (yargs) =>
    yargs
      .option('from', {
        type: 'string',
        describe: 'Import a JSON Resume file into career.yml',
      })
      .option('force', {
        type: 'boolean',
        describe: 'Overwrite existing career data',
        default: false,
      }),
  handler: (argv) => {
    ensureBaseDirs();

    const templates = fileURLToPath(
      new URL('../../../templates/', import.meta.url),
    );

    if (argv.from) {
      const source = resolve(process.cwd(), argv.from);
      if (existsSync(source) && statSync(source).isDirectory()) {
        throw new Error(
          'Pass a JSON Resume file, not a json-resume checkout directory.',
        );
      }
      const imported = importJsonResume(source, {
        force: Boolean(argv.force),
      });
      console.log(
        `dossier: imported ${imported.roles} role(s) and ${imported.projects} project(s)`,
      );
      console.log(`dossier: wrote ${imported.careerPath}`);
      if (imported.privatePath) {
        console.log(`dossier: wrote ${imported.privatePath}`);
      }
    } else {
      copyTemplate(
        `${templates}/career.example.yml`,
        careerFile,
        Boolean(argv.force),
      );
    }

    migrateLegacyFreelance();
    copyTemplate(
      `${templates}/freelance.example.yml`,
      freelanceFile,
      Boolean(argv.force),
    );
    copyTemplate(
      `${templates}/config.example.yml`,
      configFile,
      false,
    );
    mkdirSync(configDir, { recursive: true });
    loadConfig();
    ensureAgents();
    const examplesDir = installExamples();

    console.log('dossier: initialized');
    console.log(`  data:     ${dataDir}`);
    console.log(`  config:   ${configDir}`);
    console.log(`  career:   ${careerFile}`);
    console.log(`  freelance: ${freelanceFile}`);
    console.log(`  examples: ${examplesDir}`);
    console.log('');
    if (!existsSync(privateCareerFile)) {
      console.log(
        `Optional: create ${privateCareerFile} for your name, contact details, and location.`,
      );
    }
    console.log('Next: edit career.yml and freelance.yml, then run:');
    console.log("  dossier proposal 'https://www.upwork.com/jobs/...'");
  },
};

function migrateLegacyFreelance(): void {
  if (existsSync(freelanceFile)) return;
  const legacy = [legacyProposalFile, legacyUpworkFile].find((path) =>
    existsSync(path),
  );
  if (!legacy) return;
  copyFileSync(legacy, freelanceFile);
  console.log(
    `dossier: migrated legacy ${legacy} to ${freelanceFile}`,
  );
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
