import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CareerSchema } from '../src/career/schema.js';
import {
  applyProfileToCareer,
  extractUpworkProfile,
  mapProfilePortfolio,
  profileEvidenceText,
} from '../src/upwork/profile.js';

const html = readFileSync(
  new URL('./fixtures/upwork-profile.html', import.meta.url),
  'utf8',
);

describe('Upwork profile extraction', () => {
  const profile = extractUpworkProfile(
    html,
    'https://www.upwork.com/freelancers/~01fbe3cf033cea5004',
  );

  it('extracts public identity, location, rate, hours, and skills', () => {
    expect(profile.name).toBe('Ryan W.');
    expect(profile.title).toBe('Full-Stack Software Engineer | Typescript');
    expect(profile.location).toEqual({
      city: 'Chicago',
      region: 'Illinois',
      countryCode: 'US',
    });
    expect(profile.rate).toEqual({
      type: 'hourly',
      amount: 40,
      currency: 'USD',
    });
    expect(profile.hoursPerWeek).toBe('More than 30 hrs/week');
    expect(profile.skills).toContain('TypeScript');
  });

  it('extracts portfolio items and maps them to evidence ids', () => {
    expect(profile.portfolio.map((item) => item.title)).toEqual([
      'Meal Planner',
      'SlippiOS',
    ]);
    expect(profile.portfolio[0]?.evidence).toBe(
      'profile:portfolio:meal-planner',
    );

    const career = CareerSchema.parse({
      projects: [
        {
          id: 'meal-planner',
          name: 'Meal Planner',
          repo: 'rwendell/meal-planner',
          highlights: [],
        },
      ],
    });
    const mapped = mapProfilePortfolio(profile, career, []);
    expect(mapped.portfolio[0]?.evidence).toBe('project:meal-planner');
    expect(mapped.portfolio[1]?.evidence).toBe(
      'profile:portfolio:slippios',
    );
    expect(mapped.preferredSamples).toEqual([
      'project:meal-planner',
      'profile:portfolio:slippios',
    ]);
  });

  it('fills only missing career basics', () => {
    const career = CareerSchema.parse({
      basics: { name: 'Private Name' },
    });
    applyProfileToCareer(career, profile);
    expect(career.basics?.name).toBe('Private Name');
    expect(career.basics?.location?.city).toBe('Chicago');
    expect(profileEvidenceText(profile)).toContain('rate: $40/hr');
  });
});
