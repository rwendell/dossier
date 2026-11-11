/**
 * OpenCode resolves the project location from PWD rather than from the process
 * working directory. `spawnSync({ cwd })` changes the working directory but
 * leaves PWD pointing at the caller's directory, so the child must be given a
 * matching PWD or it loads the wrong project configuration.
 */
export function opencodeEnv(cwd: string): NodeJS.ProcessEnv {
  return { ...process.env, PWD: cwd };
}
