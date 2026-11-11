import { spawnSync } from 'node:child_process';

export function openFile(path: string): boolean {
  const candidates: Array<[string, string[]]> =
    process.platform === 'darwin'
      ? [['open', [path]]]
      : process.platform === 'win32'
        ? [['cmd', ['/c', 'start', '', path]]]
        : [
            ['xdg-open', [path]],
            ['gio', ['open', path]],
            ['kde-open', [path]],
            ['gnome-open', [path]],
            ['wslview', [path]],
          ];

  for (const [command, args] of candidates) {
    const result = spawnSync(command, args, {
      stdio: 'ignore',
      timeout: 5000,
    });
    if (!result.error && result.status === 0) return true;
  }
  return false;
}
