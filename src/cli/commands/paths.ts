import type { CommandModule } from 'yargs';
import { loadConfig } from '../../config/config.js';
import { getFontDir } from '../../resume/fonts.js';
import {
  careerFile,
  configDir,
  configFile,
  dataDir,
  getCacheDir,
  getCacheMode,
  getCacheSource,
  getLogDir,
  getProfileCacheDir,
  getRuntimeDir,
  freelanceFile,
  resolveOutputDir,
} from '../../config/paths.js';

interface PathsArgs {
  json?: boolean;
  out?: string;
}

export const pathsCommand: CommandModule<object, PathsArgs> = {
  command: 'paths',
  describe: 'Print the resolved data, config, cache, and output paths',
  builder: (yargs) =>
    yargs
      .option('json', {
        type: 'boolean',
        describe: 'Print JSON',
        default: false,
      })
      .option('out', {
        type: 'string',
        describe: 'Override the output directory',
      }),
  handler: (argv) => {
    const { config } = loadConfig();
    const output = resolveOutputDir(config.output.dir, argv.out);
    const paths = {
      mode: getCacheMode(),
      cacheSource: getCacheSource(),
      data: dataDir,
      config: configDir,
      configFile,
      cache: getCacheDir(),
      logs: getLogDir(),
      fonts: getFontDir(),
      runtime: getRuntimeDir(),
      profileCache: getProfileCacheDir(),
      career: careerFile,
      freelance: freelanceFile,
      output,
    };

    if (argv.json) {
      console.log(JSON.stringify(paths, null, 2));
      return;
    }

    for (const [label, value] of Object.entries(paths)) {
      console.log(`${label.padEnd(12)} ${value}`);
    }
  },
};
