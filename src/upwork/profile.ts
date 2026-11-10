import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { Career } from '../career/schema.js';
import {
  cacheDir,
  profileCacheDir,
} from '../config/paths.js';
import { slugify } from '../util/slug.js';
import { fetchRenderedHtml } from '../job/page.js';
import type { EffectiveRate } from './settings.js';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const COUNTRY_CODES = new Map<string, string>([
  ['usa', 'US'],
  ['us', 'US'],
  ['united states', 'US'],
  ['united states of america', 'US'],
  ['uk', 'GB'],
  ['gb', 'GB'],
  ['united kingdom', 'GB'],
  ['great britain', 'GB'],
  ['canada', 'CA'],
  ['australia', 'AU'],
  ['germany', 'DE'],
  ['france', 'FR'],
  ['india', 'IN'],
  ['pakistan', 'PK'],
  ['philippines', 'PH'],
  ['nigeria', 'NG'],
  ['brazil', 'BR'],
  ['mexico', 'MX'],
  ['spain', 'ES'],
  ['netherlands', 'NL'],
  ['poland', 'PL'],
  ['ukraine', 'UA'],
]);

export interface ProfilePortfolioItem {
  title: string;
  tags: string[];
  evidence: string;
}

export interface UpworkProfile {
  url: string;
  name: string;
  title: string;
  location: {
    city: string;
    region: string;
    countryCode: string;
  };
  rate: EffectiveRate | null;
  hoursPerWeek: string;
  summary: string;
  skills: string[];
  portfolio: ProfilePortfolioItem[];
  preferredSamples: string[];
  fetchedAt: string;
  cached?: boolean;
  stale?: boolean;
  cachePath?: string;
}

export interface ProfileCandidate {
  name?: string;
  displayName?: string;
  evidence?: string;
}

export interface LoadProfileOptions {
  refresh?: boolean;
  timeout?: number;
  log?: (message: string) => void;
  warn?: (message: string) => void;
}

export function isUpworkProfileUrl(value: unknown): boolean {
  return /^https?:\/\/(?:www\.)?upwork\.com\/freelancers\/[^/?#]+/i.test(
    String(value ?? ''),
  );
}

export async function loadUpworkProfile(
  url: string,
  { refresh = false, timeout = 20000, log, warn }: LoadProfileOptions = {},
): Promise<UpworkProfile> {
  if (!isUpworkProfileUrl(url)) {
    throw new Error(
      `Not an Upwork profile URL: ${url}. Use https://www.upwork.com/freelancers/~...`,
    );
  }

  const cachePath = join(
    profileCacheDir,
    `profile-${profileIdFromUrl(url)}.json`,
  );
  const cached = readProfileCache(cachePath);
  const fresh = cached && Date.now() - cached.fetchedAtMs < CACHE_TTL_MS;

  if (!refresh && fresh) {
    log?.('using cached Upwork profile');
    return {
      ...cached.profile,
      cached: true,
      cachePath: cachePath.replace(`${cacheDir}/`, ''),
    };
  }

  try {
    const profile = await fetchUpworkProfile(url, { timeout });
    if (!profile.name || !profile.title) {
      throw new Error(
        `Could not extract a public Upwork profile from ${url}. The page may require login or a different URL.`,
      );
    }
    mkdirSync(profileCacheDir, { recursive: true });
    writeFileSync(
      cachePath,
      `${JSON.stringify(
        {
          url,
          fetchedAt: profile.fetchedAt,
          profile,
        },
        null,
        '\t',
      )}\n`,
    );
    return {
      ...profile,
      cached: false,
      cachePath: cachePath.replace(`${cacheDir}/`, ''),
    };
  } catch (error) {
    if (cached) {
      warn?.(
        `profile fetch failed (${(error as Error).message}); using cached profile from ${cached.profile.fetchedAt}`,
      );
      return {
        ...cached.profile,
        cached: true,
        stale: true,
        cachePath: cachePath.replace(`${cacheDir}/`, ''),
      };
    }
    throw error;
  }
}

export async function fetchUpworkProfile(
  url: string,
  { timeout = 20000 }: { timeout?: number } = {},
): Promise<UpworkProfile> {
  const html = await fetchRenderedHtml(url, { timeout });
  return extractUpworkProfile(html, url);
}

export function extractUpworkProfile(
  html: string,
  url: string,
): UpworkProfile {
  const $ = cheerio.load(html);
  const person = findPerson($);

  const name = textOf(person?.name) || textOf($('h1').first().text());
  const title = textOf(person?.jobTitle) || titleFromDocument($);

  const locationEl = $('.d-flex.location').first();
  const city =
    textOf(
      locationEl
        .find('[data-test="location-city"], .location-city')
        .first()
        .text(),
    ) || textOf(person?.homeLocation?.address?.addressLocality);
  const region = textOf(
    locationEl
      .find('[data-test="location-state"], .location-state')
      .first()
      .text(),
  );
  const country =
    textOf(
      locationEl
        .find('[data-test="location-country"], .location-country')
        .first()
        .text(),
    ) || textOf(person?.homeLocation?.address?.addressCountry);
  const countryCode = normalizeCountryCode(
    textOf(person?.homeLocation?.address?.addressCountry) || country,
  );

  const rate = parseRate(textOf($('.overview-card').first().text()));
  const summary = textOf(
    $('[data-test="truncation-text-by-chars"]').first().text(),
  ).replace(/\s*Show more\s*$/i, '');

  const skills = Array.isArray(person?.skills)
    ? person.skills.map((skill) => String(skill).trim()).filter(Boolean)
    : [];

  const portfolio: ProfilePortfolioItem[] = [];
  const seen = new Set<string>();
  $('.portfolio-v2-shelf-thumbnail').each((_, element) => {
    const item = $(element);
    const titleText =
      textOf(item.find('.mt-3x .no-underline').first().text()) ||
      textOf(item.find('.no-underline').first().text());
    if (!titleText) return;
    const key = titleText.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    const tags = [
      ...new Set(
        item
          .find('.skill-name')
          .map((_, tag) => textOf($(tag).text()))
          .get()
          .filter(Boolean),
      ),
    ];
    portfolio.push({
      title: titleText,
      tags,
      evidence: `profile:portfolio:${slugify(titleText)}`,
    });
  });

  const hoursPerWeek = extractHoursPerWeek(html);

  return {
    url,
    name,
    title,
    location: { city, region, countryCode },
    rate,
    hoursPerWeek,
    summary,
    skills,
    portfolio,
    preferredSamples: portfolio.map((item) => item.evidence),
    fetchedAt: new Date().toISOString(),
  };
}

export function applyProfileToCareer(
  career: Career,
  profile: UpworkProfile | null,
): Career {
  if (!profile) return career;

  const basics = { ...(career.basics ?? {}) };
  if (!basics.name && profile.name) basics.name = profile.name;
  if (!basics.label && profile.title) basics.label = profile.title;

  const location = { ...(basics.location ?? {}) };
  for (const key of ['city', 'region', 'countryCode'] as const) {
    if (!location[key] && profile.location?.[key]) {
      location[key] = profile.location[key];
    }
  }
  if (Object.keys(location).length > 0) basics.location = location;

  career.basics = basics;
  return career;
}

export function mapProfilePortfolio(
  profile: UpworkProfile | null,
  career: Career,
  candidates: ProfileCandidate[] = [],
): { portfolio: ProfilePortfolioItem[]; preferredSamples: string[] } {
  if (!profile) return { portfolio: [], preferredSamples: [] };

  const projects = career.projects;

  const portfolio = profile.portfolio.map((item) => {
    const key = slugify(item.title);
    const project = projects.find(
      (entry) =>
        slugify(entry.name) === key ||
        slugify(String(entry.repo ?? '').split('/').pop()) === key,
    );
    if (project?.id) {
      return { ...item, evidence: `project:${project.id}` };
    }

    const candidate = candidates.find(
      (entry) =>
        slugify(entry.displayName || entry.name) === key ||
        slugify(entry.name) === key,
    );
    if (candidate?.evidence) {
      return { ...item, evidence: candidate.evidence };
    }

    return item;
  });

  return {
    portfolio,
    preferredSamples: [
      ...new Set(portfolio.map((item) => item.evidence).filter(Boolean)),
    ],
  };
}

export function profileEvidenceText(profile: UpworkProfile | null): string {
  if (!profile) return '';
  const location = [
    profile.location?.city,
    profile.location?.region,
    profile.location?.countryCode,
  ]
    .filter(Boolean)
    .join(', ');

  return [
    profile.name ? `name: ${profile.name}` : '',
    profile.title ? `title: ${profile.title}` : '',
    location ? `location: ${location}` : '',
    profile.rate ? `rate: ${formatProfileRate(profile.rate)}` : '',
    profile.hoursPerWeek ? `hours per week: ${profile.hoursPerWeek}` : '',
    profile.summary ? `summary: ${profile.summary}` : '',
    profile.skills?.length
      ? `skills: ${profile.skills.join(', ')}`
      : '',
    ...profile.portfolio.map(
      (item) =>
        `portfolio: ${item.title}${
          item.tags.length ? ` (${item.tags.join(', ')})` : ''
        }`,
    ),
  ]
    .filter(Boolean)
    .join('\n');
}

interface PersonLd {
  name?: unknown;
  jobTitle?: unknown;
  homeLocation?: {
    address?: {
      addressLocality?: unknown;
      addressCountry?: unknown;
    };
  };
  skills?: unknown[];
}

function findPerson($: CheerioAPI): PersonLd | null {
  let person: PersonLd | null = null;
  $('script[type="application/ld+json"]').each((_, element) => {
    if (person) return;
    try {
      const parsed = JSON.parse($(element).contents().text()) as unknown;
      const items = Array.isArray(parsed) ? parsed : [parsed];
      person =
        (items.find(
          (item) =>
            isPlainObject(item) &&
            String(item['@type'] ?? '').toLowerCase() === 'person',
        ) as PersonLd | undefined) ?? null;
    } catch {
      // Ignore malformed JSON-LD.
    }
  });
  return person;
}

function titleFromDocument($: CheerioAPI): string {
  const raw = textOf($('title').first().text()).replace(
    /\s*-\s*Upwork\s*$/i,
    '',
  );
  const parts = raw.split(/\s+-\s+/);
  return parts.length > 1 ? parts.slice(1).join(' - ').trim() : raw;
}

function parseRate(value: unknown): EffectiveRate | null {
  const match = String(value ?? '').match(
    /([$€£])\s*([\d,]+(?:\.\d+)?)\s*\/\s*hr/i,
  );
  if (!match) return null;
  return {
    type: 'hourly',
    amount: Number(match[2]!.replace(/,/g, '')),
    currency: match[1] === '€' ? 'EUR' : match[1] === '£' ? 'GBP' : 'USD',
  };
}

function extractHoursPerWeek(html: string): string {
  const match = String(html).match(
    /"(?:fullTime|partTime|asNeeded)","([^"]+)"/,
  );
  return match ? decodeUnicode(match[1]!) : '';
}

function decodeUnicode(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return String(value);
  }
}

function normalizeCountryCode(value: unknown): string {
  const key = String(value ?? '').trim().toLowerCase();
  if (!key) return '';
  return COUNTRY_CODES.get(key) ?? (key.length === 2 ? key.toUpperCase() : '');
}

function profileIdFromUrl(url: string): string {
  const match = String(url).match(/\/freelancers\/([^/?#]+)/i);
  return slugify(match ? match[1] : url) || 'profile';
}

function readProfileCache(
  path: string,
): { profile: UpworkProfile; fetchedAtMs: number } | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
      profile?: UpworkProfile;
      fetchedAt?: string;
    };
    if (!parsed.profile) return null;
    return {
      profile: parsed.profile,
      fetchedAtMs: Date.parse(parsed.fetchedAt ?? '') || 0,
    };
  } catch {
    return null;
  }
}

function formatProfileRate(rate: EffectiveRate): string {
  const symbol =
    rate.currency === 'EUR' ? '€' : rate.currency === 'GBP' ? '£' : '$';
  const amount = Number(rate.amount).toLocaleString('en-US', {
    maximumFractionDigits: 2,
  });
  return `${symbol}${amount}/hr`;
}

function textOf(value: unknown): string {
  return String(value ?? '').trim();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
