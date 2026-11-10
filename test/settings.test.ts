import { describe, expect, it } from 'vitest';
import {
  buildProposalSettings,
  extractRequiredOpening,
  ProposalConfigSchema,
} from '../src/upwork/settings.js';

const profile = {
  rate: { type: 'hourly' as const, amount: 40, currency: 'USD' },
  hoursPerWeek: 'More than 30 hrs/week',
  preferredSamples: ['profile:portfolio:meal-planner'],
};

describe('proposal settings precedence', () => {
  it('uses the public profile rate when YAML leaves it null', () => {
    const config = ProposalConfigSchema.parse({});
    const settings = buildProposalSettings(config, {}, profile);
    expect(settings.rate).toEqual({
      type: 'hourly',
      amount: 40,
      currency: 'USD',
    });
    expect(settings.availability).toBe('More than 30 hrs/week');
  });

  it('lets YAML override the profile', () => {
    const config = ProposalConfigSchema.parse({
      rate: { amount: 85, currency: 'USD' },
      availability: '20-30 hrs/week',
      preferredSamples: ['nt-kafka'],
    });
    const settings = buildProposalSettings(config, {}, profile);
    expect(settings.rate?.amount).toBe(85);
    expect(settings.availability).toBe('20-30 hrs/week');
    expect(settings.preferredSamples).toEqual(['nt-kafka']);
  });

  it('lets CLI flags override YAML and profile', () => {
    const config = ProposalConfigSchema.parse({
      rate: { amount: 85 },
      availability: '20-30 hrs/week',
    });
    const settings = buildProposalSettings(
      config,
      { rate: 90, availability: '10 hrs/week' },
      profile,
    );
    expect(settings.rate?.amount).toBe(90);
    expect(settings.availability).toBe('10 hrs/week');
  });

  it('extracts a required opening phrase', () => {
    expect(
      extractRequiredOpening(
        'TO APPLY, start your proposal with the word "forecourt" and tell us about a system.',
      ),
    ).toBe('forecourt');
    expect(
      extractRequiredOpening('Please begin with the phrase "hello there" first.'),
    ).toBe('hello there');
    expect(extractRequiredOpening('We start with a kickoff call.')).toBe('');
  });
});
