import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { slugify } from '../util/slug.js';
import { fetchJobPage, isUrl, JobPageError } from './page.js';
import type { Job, JobDetails, JobInputOptions } from './types.js';

export async function readJobInput(opts: JobInputOptions): Promise<Job> {
  let body = '';
  let source = opts.input || opts.description || opts.url || 'job';
  let meta: Record<string, unknown> = {};
  let details: JobDetails = {};

  const urlSource = isUrl(opts.input)
    ? opts.input!
    : isUrl(opts.description)
      ? opts.description!
      : !opts.input && !opts.description && isUrl(opts.url)
        ? opts.url!
        : '';

  if (urlSource) {
    try {
      const page = await fetchJobPage(urlSource);
      body = page.body;
      details = page.details;
      meta = {
        title: page.title,
        company: page.company,
        url: page.url,
      };
      source = urlSource;
    } catch (error) {
      if (error instanceof JobPageError) {
        throw new JobPageError(
          `${error.message}\nSave the job description to a file and pass the file path instead, or pass --title and --company with --description.`,
        );
      }
      throw error;
    }
  }

  if (opts.input && !isUrl(opts.input)) {
    const inputPath = resolve(process.cwd(), opts.input);
    if (!existsSync(inputPath)) {
      throw new Error(`Job file not found: ${inputPath}`);
    }
    source = inputPath;
    const raw = readFileSync(inputPath, 'utf8');
    const frontmatter = splitFrontmatter(raw);
    meta = frontmatter.meta;
    details = isPlainObject(frontmatter.meta.details)
      ? (frontmatter.meta.details as JobDetails)
      : {};
    body = frontmatter.body;
  }

  if (opts.description && !isUrl(opts.description)) {
    const descriptionPath = resolve(process.cwd(), opts.description);
    body =
      existsSync(descriptionPath) && statSync(descriptionPath).isFile()
        ? readFileSync(descriptionPath, 'utf8')
        : opts.description;
    source = opts.description;
  }

  if (!body.trim() && opts.input && !isUrl(opts.input)) {
    body = readFileSync(resolve(process.cwd(), opts.input), 'utf8');
  }

  const title =
    opts.title ||
    stringValue(meta.title) ||
    stringValue(meta.position) ||
    firstHeading(body) ||
    '';
  const company = opts.company || stringValue(meta.company) || '';
  const url =
    opts.url || stringValue(meta.url) || (isUrl(source) ? source : '');

  return {
    title: String(title).trim(),
    company: String(company).trim(),
    url: String(url).trim(),
    body: body.trim(),
    source,
    details,
  };
}

export function splitFrontmatter(raw: string): {
  meta: Record<string, unknown>;
  body: string;
} {
  if (!raw.startsWith('---')) return { meta: {}, body: raw };
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };

  let meta: Record<string, unknown> = {};
  try {
    const parsed = parseYaml(match[1]!) ?? {};
    if (!isPlainObject(parsed)) {
      throw new Error('frontmatter must be a YAML object');
    }
    meta = parsed;
  } catch (error) {
    throw new Error(
      `Could not parse job frontmatter: ${(error as Error).message}`,
    );
  }
  return { meta, body: match[2] ?? '' };
}

export function firstHeading(text: string): string {
  const match = text.match(/^#\s+(.+)$/m);
  return match ? match[1]!.trim() : '';
}

export function formatJobMarkdown(job: Job): string {
  const lines = [
    '---',
    `company: ${JSON.stringify(String(job.company ?? ''))}`,
    `title: ${JSON.stringify(String(job.title ?? ''))}`,
    `url: ${JSON.stringify(String(job.url ?? ''))}`,
    `captured: ${new Date().toISOString().slice(0, 10)}`,
  ];
  if (job.details && Object.keys(job.details).length > 0) {
    lines.push(...stringifyYamlDetails(job.details));
  }
  lines.push('---', '', job.body.trim(), '');
  return lines.join('\n');
}

function stringifyYamlDetails(details: JobDetails): string[] {
  // Kept small and dependency-free; the cache file only needs to be readable.
  const lines = ['details:'];
  for (const [key, value] of Object.entries(details)) {
    if (Array.isArray(value)) {
      lines.push(`  ${key}:`);
      for (const item of value) {
        lines.push(`    - ${JSON.stringify(String(item))}`);
      }
    } else if (value != null) {
      lines.push(`  ${key}: ${JSON.stringify(String(value))}`);
    }
  }
  return lines;
}

export function jobSlug(job: Job): string {
  return (
    slugify([job.company, job.title].filter(Boolean).join(' ')) ||
    'application'
  );
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
