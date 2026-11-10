import { existsSync, readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import {
  legacyProposalFile,
  proposalFile,
} from '../config/paths.js';

export const DEFAULT_BANNED_PHRASES = [
  'I hope this message finds you well',
  'Dear Hiring Manager',
  'I am excited to apply',
  'I am the perfect fit',
  'I would be a great fit',
  'As an AI language model',
];

export const RateSchema = z.object({
  type: z.enum(['hourly', 'fixed']).default('hourly'),
  amount: z.number().positive().nullable().default(null),
  currency: z.string().default('USD'),
});

export const ProposalConfigSchema = z
  .object({
    profile: z
      .union([
        z.string(),
        z.object({ url: z.string().default('') }).passthrough(),
      ])
      .optional(),
    rate: RateSchema.default({
      type: 'hourly',
      amount: null,
      currency: 'USD',
    }),
    minHourlyRate: z.number().positive().nullable().default(null),
    availability: z.string().default(''),
    timezone: z.string().default(''),
    timeline: z.string().default(''),
    proposal: z
      .object({
        targetWords: z.number().positive().default(180),
        minWords: z.number().positive().default(120),
        maxWords: z.number().positive().default(260),
        maxChars: z.number().positive().default(5000),
        includeRate: z.boolean().default(false),
        includeAvailability: z.boolean().default(true),
      })
      .default({
        targetWords: 180,
        minWords: 120,
        maxWords: 260,
        maxChars: 5000,
        includeRate: false,
        includeAvailability: true,
      }),
    preferredSamples: z.array(z.string()).default([]),
    bannedPhrases: z.array(z.string()).default([]),
  })
  .passthrough();

export type ProposalConfig = z.infer<typeof ProposalConfigSchema>;
export type ConfiguredRate = z.infer<typeof RateSchema>;

export interface EffectiveRate {
  type: 'hourly' | 'fixed';
  amount: number;
  currency: string;
}

export interface LoadedProposalConfig {
  config: ProposalConfig;
  path: string | null;
}

export function loadProposalConfig(): LoadedProposalConfig {
  const path = existsSync(proposalFile)
    ? proposalFile
    : existsSync(legacyProposalFile)
      ? legacyProposalFile
      : null;

  if (!path) {
    return { config: ProposalConfigSchema.parse({}), path: null };
  }

  const raw = parseYaml(readFileSync(path, 'utf8')) ?? {};
  return { config: ProposalConfigSchema.parse(raw), path };
}

export interface ProfileDefaults {
  rate?: EffectiveRate | null;
  hoursPerWeek?: string;
  preferredSamples?: string[];
}

export interface ProposalOptions {
  rate?: string | number;
  rateType?: string;
  noRate?: boolean;
  availability?: string;
  timeline?: string;
  profile?: string;
  noProfile?: boolean;
}

export interface ProposalSettings {
  targetWords: number;
  minWords: number;
  maxWords: number;
  maxChars: number;
  includeRate: boolean;
  includeAvailability: boolean;
  rate: EffectiveRate | null;
  availability: string;
  timeline: string;
  timezone: string;
  profileUrl: string;
  minHourlyRate: number | null;
  preferredSamples: string[];
  bannedPhrases: string[];
  currency: string;
}

export function buildProposalSettings(
  config: ProposalConfig,
  opts: ProposalOptions = {},
  profile?: ProfileDefaults | null,
): ProposalSettings {
  const cliRate = numberOrNull(opts.rate);
  const configRate = numberOrNull(config.rate.amount);
  const profileRate = numberOrNull(profile?.rate?.amount);
  const hourlyRate = cliRate ?? configRate ?? profileRate;

  const rateType = String(
    opts.rateType || config.rate.type || profile?.rate?.type || 'hourly',
  ).toLowerCase();

  const currency = String(
    config.rate.currency || profile?.rate?.currency || 'USD',
  );

  const configuredProfileUrl =
    typeof config.profile === 'string'
      ? config.profile
      : config.profile?.url;
  const profileUrl =
    cleanText(opts.profile) ||
    (!opts.noProfile ? cleanText(configuredProfileUrl) : '');

  const yamlPreferred = config.preferredSamples;
  const preferredSamples =
    yamlPreferred.length > 0
      ? yamlPreferred
      : (profile?.preferredSamples ?? []);

  return {
    targetWords: config.proposal.targetWords,
    minWords: config.proposal.minWords,
    maxWords: config.proposal.maxWords,
    maxChars: config.proposal.maxChars,
    includeRate: opts.noRate
      ? false
      : Boolean(opts.rate) || config.proposal.includeRate,
    includeAvailability: config.proposal.includeAvailability !== false,
    rate:
      hourlyRate == null
        ? null
        : {
            type: rateType === 'fixed' ? 'fixed' : 'hourly',
            amount: hourlyRate,
            currency,
          },
    availability:
      cleanText(opts.availability) ||
      cleanText(config.availability) ||
      cleanText(profile?.hoursPerWeek),
    timeline: cleanText(opts.timeline) || cleanText(config.timeline),
    timezone: cleanText(config.timezone),
    profileUrl,
    minHourlyRate: config.minHourlyRate,
    preferredSamples,
    bannedPhrases: [
      ...new Set([...DEFAULT_BANNED_PHRASES, ...config.bannedPhrases]),
    ],
    currency,
  };
}

export function extractRequiredOpening(body: string): string {
  const text = String(body ?? '');
  const match = text.match(
    /(?:start|begin)\s+(?:(?:your|the)\s+proposal\s+with|with\s+(?:the\s+word|the\s+phrase))\s*(?:the\s+word|the\s+phrase)?\s*["“'‘]?([^"”'’.\n]+)/i,
  );
  if (!match) return '';
  return match[1]!
    .trim()
    .replace(/^["“'‘]+|["”'’]+$/g, '')
    .replace(/\s+(?:and|then)\b.*$/i, '')
    .replace(/[.,;:]+$/, '')
    .trim();
}

export function parseBudget(
  value: unknown,
): { min: number; max: number; raw: string } | null {
  const text = String(value ?? '').replace(/,/g, '');
  const amounts = [...text.matchAll(/\$?\s*(\d+(?:\.\d+)?)/g)].map((match) =>
    Number(match[1]),
  );
  if (amounts.length === 0) return null;
  return {
    min: Math.min(...amounts),
    max: Math.max(...amounts),
    raw: String(value),
  };
}

export function formatRate(
  rate:
    | { type: 'hourly' | 'fixed'; amount: number; currency?: string }
    | null
    | undefined,
): string {
  if (!rate || rate.amount == null) return '';
  const symbol =
    rate.currency === 'EUR' ? '€' : rate.currency === 'GBP' ? '£' : '$';
  const amount = Number(rate.amount).toLocaleString('en-US', {
    maximumFractionDigits: 2,
  });
  return rate.type === 'fixed'
    ? `${symbol}${amount} fixed`
    : `${symbol}${amount}/hr`;
}

export function describeBudget(details: {
  budget?: string;
  budgetType?: string;
}): string {
  if (!details.budget) return '';
  return details.budgetType === 'fixed'
    ? `${details.budget} fixed`
    : `${details.budget}/hr`;
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
