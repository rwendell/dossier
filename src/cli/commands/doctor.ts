import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import type { CommandModule } from 'yargs';
import {
  agentsDir,
  cacheDir,
  careerFile,
  configFile,
  dataDir,
  opencodeAgentsDir,
  privateCareerFile,
  proposalFile,
} from '../../config/paths.js';
import { loadConfig } from '../../config/config.js';
import { loadProposalConfig } from '../../upwork/settings.js';

export const doctorCommand: CommandModule = {
  command: 'doctor',
  describe: 'Check the local dossier setup and external tools',
  handler: async () => {
    let failures = 0;
    const check = (
      label: string,
      ok: boolean,
      detail: string,
      required = false,
    ) => {
      const status = ok ? 'ok' : required ? 'missing' : 'warn';
      console.log(`${status.padEnd(8)} ${label.padEnd(18)} ${detail}`);
      if (!ok && required) failures += 1;
    };

    const nodeMajor = Number(process.versions.node.split('.')[0]);
    check('node', nodeMajor >= 20, process.versions.node, true);
    check('data dir', existsSync(dataDir), dataDir, true);
    check('config file', existsSync(configFile), configFile, false);
    check('career.yml', existsSync(careerFile), careerFile, true);
    check(
      'career.private',
      existsSync(privateCareerFile),
      privateCareerFile,
      false,
    );
    check('proposal.yml', existsSync(proposalFile), proposalFile, true);
    check('cache dir', existsSync(cacheDir), cacheDir, false);
    const requiredAgents = [
      'dossier-proposer.md',
      'dossier-answerer.md',
      'dossier-tailor.md',
    ];
    const agentInstalled = requiredAgents.every(
      (file) =>
        existsSync(`${opencodeAgentsDir}/${file}`) ||
        existsSync(`${agentsDir}/${file}`),
    );
    check(
      'agents',
      agentInstalled,
      existsSync(`${opencodeAgentsDir}/dossier-proposer.md`)
        ? opencodeAgentsDir
        : agentsDir,
      true,
    );

    check(
      'opencode',
      Boolean(commandVersion('opencode', ['--version'])),
      commandVersion('opencode', ['--version']) || 'not found',
      true,
    );
    check(
      'gh',
      Boolean(commandVersion('gh', ['--version'])),
      firstLine(commandVersion('gh', ['--version'])) || 'not found',
      false,
    );

    try {
      const puppeteer = (await import('puppeteer')).default;
      const path = puppeteer.executablePath();
      check('chrome', existsSync(path), path, false);
    } catch (error) {
      check('chrome', false, (error as Error).message, false);
    }

    const { config } = loadConfig();
    console.log(
      `${'info'.padEnd(8)} ${'provider'.padEnd(18)} ${config.provider}`,
    );
    const proposal = loadProposalConfig();
    console.log(
      `${'info'.padEnd(8)} ${'proposal config'.padEnd(18)} ${
        proposal.path ?? 'using built-in defaults'
      }`,
    );

    const installedAgentDir = existsSync(opencodeAgentsDir)
      ? opencodeAgentsDir
      : agentsDir;
    if (existsSync(installedAgentDir)) {
      const agents = readdirSync(installedAgentDir).filter((file) =>
        file.endsWith('.md'),
      );
      console.log(
        `${'info'.padEnd(8)} ${'agent files'.padEnd(18)} ${agents.join(', ') || 'none'}`,
      );
    }

    if (failures > 0) {
      process.exitCode = 1;
    }
  },
};

function commandVersion(command: string, args: string[]): string {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 10_000,
  });
  if (result.error || result.status !== 0) return '';
  return firstLine(result.stdout);
}

function firstLine(value: string): string {
  return String(value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean) ?? '';
}
