import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const TIMEOUT = 5_000;

type Opener = {
  command: string;
  args: string[];
  cwd?: string;
};

/**
 * Open a file with the platform's default handler.
 *
 * WSL is handled explicitly: there is no desktop there, so xdg-open usually
 * fails or hangs, and the Windows interop binaries are not on PATH when
 * appendWindowsPath is disabled.
 */
export function openFile(path: string): boolean {
  for (const opener of openers(path)) {
    const result = spawnSync(opener.command, opener.args, {
      stdio: 'ignore',
      timeout: TIMEOUT,
      cwd: opener.cwd,
    });
    if (!result.error && result.status === 0) return true;
  }
  return false;
}

export function openers(path: string): Opener[] {
  if (process.platform === 'darwin') {
    return [{ command: 'open', args: [path] }];
  }
  if (process.platform === 'win32') {
    return [{ command: 'cmd', args: ['/c', 'start', '', path] }];
  }

  const wsl = wslOpeners(path);
  if (wsl) return wsl;

  return [
    { command: 'xdg-open', args: [path] },
    { command: 'gio', args: ['open', path] },
    { command: 'kde-open', args: [path] },
    { command: 'gnome-open', args: [path] },
  ];
}

function wslOpeners(path: string): Opener[] | null {
  if (!isWsl()) return null;

  const openers: Opener[] = [];
  if (onPath('wslview')) {
    openers.push({ command: 'wslview', args: [path] });
  }

  const target = windowsPath(path);
  if (target) {
    const powershell = windowsBinary(
      'WindowsPowerShell/v1.0/powershell.exe',
    );
    if (powershell) {
      // Start-Process takes the path as a single argument and copes with
      // spaces, unlike `cmd /c start`.
      openers.push({
        command: powershell,
        args: [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Start-Process -FilePath '${target.replace(/'/g, "''")}'`,
        ],
        cwd: '/mnt/c/Windows',
      });
    }

    const cmd = windowsBinary('cmd.exe');
    if (cmd) {
      // Run from C:\Windows: starting cmd.exe in a WSL UNC directory prints
      // "UNC paths are not supported" even though `start` still works.
      openers.push({
        command: cmd,
        args: ['/c', 'start', 'explorer.exe', target],
        cwd: '/mnt/c/Windows',
      });
    }

    const explorer = windowsBinary('explorer.exe');
    if (explorer) {
      openers.push({ command: explorer, args: [target] });
    }
  }

  return openers.length > 0 ? openers : null;
}

export function isWsl(): boolean {
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) return true;
  try {
    return /microsoft/i.test(readFileSync('/proc/version', 'utf8'));
  } catch {
    return false;
  }
}

function windowsPath(path: string): string | null {
  const result = spawnSync('wslpath', ['-w', path], {
    encoding: 'utf8',
    timeout: TIMEOUT,
  });
  if (result.error || result.status !== 0) return null;
  const converted = (result.stdout ?? '').trim();
  return converted || null;
}

function windowsBinary(name: string): string | null {
  const parts = name.split('/');
  for (const root of ['/mnt/c', '/c']) {
    for (const candidate of [
      join(root, 'Windows', 'System32', ...parts),
      join(root, 'Windows', ...parts),
    ]) {
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function onPath(command: string): boolean {
  const result = spawnSync('which', [command], {
    encoding: 'utf8',
    timeout: TIMEOUT,
  });
  return !result.error && result.status === 0;
}
