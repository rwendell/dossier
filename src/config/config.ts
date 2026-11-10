import { existsSync, readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { configFile } from './paths.js';

export const ProviderSchema = z.enum([
  'auto',
  'opencode',
  'go',
  'openrouter',
]);

export const ConfigSchema = z
  .object({
    output: z
      .object({
        dir: z.string().default(''),
      })
      .default({ dir: '' }),
    publish: z
      .object({
        repo: z.string().default(''),
      })
      .default({ repo: '' }),
    theme: z.string().default('jsonresume-theme-straightforward'),
    provider: ProviderSchema.default('auto'),
    editor: z.string().default(''),
  });

export type Config = z.infer<typeof ConfigSchema>;

export interface LoadedConfig {
  config: Config;
  path: string | null;
}

export function loadConfig(): LoadedConfig {
  if (!existsSync(configFile)) {
    return { config: withEnv(ConfigSchema.parse({})), path: null };
  }

  const raw = parseYaml(readFileSync(configFile, 'utf8')) ?? {};
  const config = ConfigSchema.parse(raw);
  return { config: withEnv(config), path: configFile };
}

function withEnv(config: Config): Config {
  return {
    ...config,
    provider: process.env.DOSSIER_PROVIDER
      ? ProviderSchema.parse(process.env.DOSSIER_PROVIDER)
      : config.provider,
    output: {
      ...config.output,
      dir: process.env.DOSSIER_OUTPUT_DIR ?? config.output.dir,
    },
    publish: {
      ...config.publish,
      repo: process.env.DOSSIER_PUBLISH_REPO ?? config.publish.repo,
    },
  };
}

export function formatConfig(config: Config): string {
  return `# dossier machine configuration
output:
  # Empty means the current working directory.
  dir: ""

publish:
  # Optional checkout of the json-resume site repo.
  repo: ""

theme: "${config.theme}"
provider: "${config.provider}"
editor: ""
`;
}
