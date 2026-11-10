import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { loadCareer } from '../career/load.js';
import { getCacheDir, privateCareerFile } from '../config/paths.js';

export interface PullPrivateOptions {
  gist?: string;
  file?: string;
  allowPublic?: boolean;
}

interface Gist {
  id: string;
  public?: boolean;
  updated_at?: string;
  files?: Record<string, unknown>;
}

export function pullPrivate(options: PullPrivateOptions = {}): void {
  const fileName = options.file || 'career.private.yml';
  const outputPath = privateCareerFile;

  const gist = resolveGist({
    requested: options.gist,
    fileName,
    allowPublic: Boolean(options.allowPublic),
  });

  let content: string;
  try {
    content = execFileSync(
      'gh',
      ['gist', 'view', gist.id, '--filename', fileName, '--raw'],
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
    );
  } catch (error) {
    throw new Error(
      formatGhError(`Could not read ${fileName} from gist ${gist.id}`, error),
    );
  }

  content = `${content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .trimEnd()}\n`;

  const parsed = parseYaml(content) as unknown;
  if (!isPlainObject(parsed)) {
    throw new Error(`${fileName} is not a YAML object.`);
  }
  const basics = parsed.basics;
  if (!isPlainObject(basics)) {
    throw new Error(`${fileName} does not contain a basics object.`);
  }
  if (
    !['name', 'email', 'phone', 'location'].some(
      (key) => basics[key] != null,
    )
  ) {
    throw new Error(
      `${fileName} does not look like the private PII overlay.`,
    );
  }

  const existing = existsSync(outputPath)
    ? readFileSync(outputPath, 'utf8')
    : null;

  if (existing === content) {
    console.log(
      `dossier: pull-private already up to date (${gist.public ? 'public' : 'secret'} gist)`,
    );
    reportMerge();
    return;
  }

  if (existing) {
    const backupDir = join(getCacheDir(), 'pull-private');
    mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = join(backupDir, `career.private-${stamp}.yml`);
    writeFileSync(backupPath, existing);
    console.log(`dossier: backed up the previous file to ${backupPath}`);
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, content);
  console.log(
    `dossier: wrote ${outputPath} (${gist.public ? 'public' : 'secret'} gist)`,
  );
  reportMerge();
}

export function parseGistId(value: string): string {
  const text = String(value ?? '').trim();
  const urlMatch = text.match(
    /gist\.github\.com\/(?:[^/]+\/)?([a-f0-9]+)/i,
  );
  if (urlMatch) return urlMatch[1]!;
  if (/^[a-f0-9]+$/i.test(text)) return text;
  throw new Error(`Invalid gist id or URL: ${text || '(empty)'}`);
}

function resolveGist({
  requested,
  fileName,
  allowPublic,
}: {
  requested?: string;
  fileName: string;
  allowPublic: boolean;
}): { id: string; public: boolean } {
  if (requested) {
    return loadGist(parseGistId(requested), fileName, allowPublic);
  }

  const envId = process.env.CAREER_PRIVATE_GIST_ID;
  if (envId) {
    return loadGist(parseGistId(envId), fileName, allowPublic);
  }

  const gists = listGists();
  const matches = gists.filter((item) => item.files?.[fileName]);
  const secretMatches = allowPublic
    ? matches
    : matches.filter((item) => item.public === false);

  if (secretMatches.length === 0) {
    if (matches.length > 0) {
      throw new Error(
        `Only public gist(s) contain ${fileName}. Refusing to pull PII from a public gist; pass --allow-public only if you accept that risk.`,
      );
    }
    throw new Error(
      `No gist containing ${fileName} was found. Pass --gist <id|url>, set CAREER_PRIVATE_GIST_ID, or create one with "gh gist create ${privateCareerFile}".`,
    );
  }

  secretMatches.sort(
    (a, b) => Date.parse(b.updated_at ?? '') - Date.parse(a.updated_at ?? ''),
  );
  if (secretMatches.length > 1) {
    throw new Error(
      `Multiple secret gists contain ${fileName}. Run "gh gist list" or pass --gist to choose one.`,
    );
  }

  return loadGist(secretMatches[0]!.id, fileName, allowPublic);
}

function loadGist(
  id: string,
  fileName: string,
  allowPublic: boolean,
): { id: string; public: boolean } {
  const gist = fetchGist(id);
  if (gist.public && !allowPublic) {
    throw new Error(
      `Gist ${id} is public. Refusing to pull PII from a public gist; pass --allow-public only if you accept that risk.`,
    );
  }
  if (!gist.files?.[fileName]) {
    const available = Object.keys(gist.files ?? {});
    throw new Error(
      `Gist ${id} does not contain ${fileName}. Available file(s): ${available.join(', ') || '(none)'}.`,
    );
  }
  return { id, public: gist.public === true };
}

function listGists(): Gist[] {
  let raw: string;
  try {
    raw = execFileSync('gh', ['api', 'gists?per_page=100', '--paginate'], {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch (error) {
    throw new Error(formatGhError('Could not list gists', error));
  }

  let data: unknown;
  try {
    data = JSON.parse(raw) as unknown;
  } catch (error) {
    throw new Error(
      `Could not parse the gist list: ${(error as Error).message}`,
    );
  }
  if (!Array.isArray(data)) {
    throw new Error('GitHub returned an unexpected gist list.');
  }
  return data as Gist[];
}

function fetchGist(id: string): Gist {
  let raw: string;
  try {
    raw = execFileSync('gh', ['api', `gists/${id}`], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    throw new Error(formatGhError(`Could not read gist ${id}`, error));
  }

  try {
    const gist = JSON.parse(raw) as Gist;
    if (!gist?.id) throw new Error('missing id');
    return gist;
  } catch (error) {
    throw new Error(
      `Could not parse gist ${id}: ${(error as Error).message}`,
    );
  }
}

function formatGhError(prefix: string, error: unknown): string {
  const err = error as NodeJS.ErrnoException & { stderr?: string };
  if (err?.code === 'ENOENT') {
    return `${prefix}: the gh CLI was not found. Install GitHub CLI and run "gh auth login".`;
  }
  const stderr = err?.stderr ? String(err.stderr).trim() : '';
  return `${prefix}: ${stderr || err?.message || String(error)}`;
}

function reportMerge(): void {
  try {
    const { career } = loadCareer();
    const achievements = career.roles.reduce(
      (sum, role) => sum + role.achievements.length,
      0,
    );
    console.log(
      `dossier: merged ${career.roles.length} role(s), ${achievements} achievement(s)`,
    );
  } catch (error) {
    throw new Error(
      `Pulled the file, but the merged career failed to load: ${(error as Error).message}`,
    );
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
