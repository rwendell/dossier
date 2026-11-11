import { describe, expect, it } from 'vitest';
import {
  buildCareer,
  buildPrivateOverlay,
} from '../src/career/import-resume.js';

const resume = {
  basics: {
    name: 'Ryan W.',
    label: 'Software Engineer',
    email: 'ryan@example.com',
    url: 'https://example.com',
    summary: 'Builds systems.',
    location: {
      city: 'Chicago',
      region: 'Illinois',
      countryCode: 'US',
    },
    profiles: [
      {
        network: 'GitHub',
        username: 'rwendell',
        url: 'https://github.com/rwendell',
      },
    ],
  },
  work: [
    {
      name: 'Acme',
      position: 'Engineer',
      startDate: '2022-01',
      endDate: '2026-01',
      summary: 'Built things.',
      highlights: ['Built a production system.', 'Wrote documentation.'],
    },
  ],
  projects: [
    {
      name: 'Meal Planner',
      url: 'https://github.com/rwendell/meal-planner',
      description: 'A multi-user app.',
      highlights: ['Built authentication.'],
    },
  ],
  skills: [{ name: 'TypeScript', keywords: ['TypeScript', 'React'] }],
  education: [
    {
      institution: 'Iowa State University',
      area: 'Computer Science',
      studyType: 'BS',
      startDate: '2016',
      endDate: '2020',
    },
  ],
};

describe('JSON Resume import', () => {
  it('maps public data into the career fact bank', () => {
    const career = buildCareer(resume);
    expect(career.roles[0]?.company).toBe('Acme');
    expect(career.roles[0]?.achievements[0]?.id).toBe('acme-1');
    expect(career.roles[0]?.achievements[0]?.text).toBe(
      'Built a production system.',
    );
    expect(career.projects[0]?.repo).toBe('rwendell/meal-planner');
    expect(career.projects[0]?.highlights[0]?.id).toBe(
      'meal-planner-1',
    );
    expect(career.skills).toHaveLength(1);
    expect(career.education[0]?.institution).toBe('Iowa State University');
    expect(career.basics?.name).toBeUndefined();
    expect(career.basics?.profiles?.[0]?.network).toBe('GitHub');
  });

  it('maps PII into the private overlay', () => {
    const overlay = buildPrivateOverlay(resume);
    expect(overlay?.basics).toMatchObject({
      name: 'Ryan W.',
      email: 'ryan@example.com',
      location: {
        city: 'Chicago',
        region: 'Illinois',
        countryCode: 'US',
      },
    });
  });
});
