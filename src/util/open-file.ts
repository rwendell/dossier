import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const TIMEOUT = 5_000;

export interface Opener {
  command: string;
  args: string[];
  cwd?: string;
}

export interface OpenerContext {
  platform: NodeJS.Platform;
  wsl: boolean;
  graphical: boolean;
}

/**
 * Open a file with the platform's default handler.
 *
 * There is no OS call for "open with the default application", so every
 * platform delegates to its own helper: `open` on macOS, `start` on Windows,
 * and `xdg-open` (the freedesktop standard) on a Linux desktop.
 *
 * WSL is its own case: the desktop belongs to Windows, not to the Linux
 * userland, so `xdg-open` is skipped and the file is handed to Windows
 * interop instead.
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

export function openers(
  path: string,
  context: OpenerContext = detectContext(),
): Opener[] {
  if (context.platform === 'darwin') {
    return [{ command: 'open', args: [path] }];
  }
  if (context.platform === 'win32') {
    return [{ command: 'cmd', args: ['/c', 'start', '', path] }];
  }

  if (context.wsl) return wslOpeners(path);

  // Without a display there is no default handler. Trying anyway makes
  // xdg-open hang (or launch a terminal editor), so fail fast instead.
  if (!context.graphical) return [];

  return [
    { command: 'xdg-open', args: [path] },
    { command: 'gio', args: ['open', path] },
    { command: 'kde-open', args: [path] },
    { command: 'gnome-open', args: [path] },
  ];
}

export function detectContext(): OpenerContext {
  return {
    platform: process.platform,
    wsl: isWsl(),
    graphical: Boolean(
      process.env.DISPLAY ||
        process.env.WAYLAND_DISPLAY ||
        process.env.XDG_SESSION_TYPE === 'x11' ||
        process.env.XDG_SESSION_TYPE === 'wayland',
    ),
  };
}

function wslOpeners(path: string): Opener[] {
  const openers: Opener[] = [];
  if (onPath('wslview')) {
    openers.push({ command: 'wslview', args: [path] });
  }

  const root = windowsRoot();
  const target = windowsPath(path);
  if (!root || !target) return openers;

  const windowsDir = join(root, 'Windows');
  const powershell = join(
    root,
    'Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  if (existsSync(powershell)) {
    // Start-Process takes the path as one argument and copes with spaces,
    // unlike `cmd /c start`.
    openers.push({
      command: powershell,
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Start-Process -FilePath '${target.replace(/'/g, "''")}'`,
      ],
      cwd: windowsDir,
    });
  }

  const cmd = join(root, 'Windows', 'System32', 'cmd.exe');
  if (existsSync(cmd)) {
    // Run from C:\Windows: starting cmd.exe in a WSL UNC directory prints
    // "UNC paths are not supported" even though `start` still works.
    openers.push({
      command: cmd,
      args: ['/c', 'start', 'explorer.exe', target],
      cwd: windowsDir,
    });
  }

  const explorer = join(root, 'Windows', 'explorer.exe');
  if (existsSync(explorer)) {
    openers.push({ command: explorer, args: [target] });
  }

  return openers;
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

/**
 * Find the Windows system drive mount. It is usually /mnt/c, but the drive
 * letter and mount point are configurable, so probe instead of assuming.
 */
function windowsRoot(): string | null {
  for (const root of ['/mnt/c', '/c']) {
    if (isWindowsRoot(root)) return root;
  }
  try {
    for (const entry of readdirSync('/mnt')) {
      const root = join('/mnt', entry);
      if (isWindowsRoot(root)) return root;
    }
  } catch {
    // No /mnt directory.
  }
  return null;
}

function isWindowsRoot(root: string): boolean {
  return existsSync(join(root, 'Windows', 'System32', 'cmd.exe'));
}

function onPath(command: string): boolean {
  const result = spawnSync('which', [command], {
    encoding: 'utf8',
    timeout: TIMEOUT,
  });
  return !result.error && result.status === 0;
}
