import { describe, expect, it } from 'vitest';
import { openers, type OpenerContext } from '../src/util/open-file.js';

const base: OpenerContext = {
  platform: 'linux',
  wsl: false,
  graphical: true,
};

describe('pdf openers', () => {
  it('uses the platform helper on macOS and Windows', () => {
    expect(openers('/tmp/a.pdf', { ...base, platform: 'darwin' })[0]).toEqual({
      command: 'open',
      args: ['/tmp/a.pdf'],
    });
    expect(openers('/tmp/a.pdf', { ...base, platform: 'win32' })[0]?.command).toBe(
      'cmd',
    );
  });

  it('defers to the freedesktop handler on a Linux desktop', () => {
    const commands = openers('/tmp/a.pdf', base).map((o) => o.command);
    expect(commands[0]).toBe('xdg-open');
    expect(commands).toContain('gio');
  });

  it('does not try a Linux handler without a display', () => {
    expect(openers('/tmp/a.pdf', { ...base, graphical: false })).toEqual([]);
  });
});
