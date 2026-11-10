import { describe, expect, it } from 'vitest';
import { CareerSchema } from '../src/career/schema.js';
import type { Job } from '../src/job/types.js';
import {
  verifyProposal,
  type ProposalOutput,
} from '../src/evidence/verify.js';

const career = CareerSchema.parse({
  basics: {
    location: { city: 'Chicago', region: 'Illinois', countryCode: 'US' },
  },
  roles: [
    {
      id: 'example',
      company: 'Example Co',
      position: 'Engineer',
      startDate: '2022',
      endDate: '2026',
      achievements: [
        {
          id: 'example-delivery',
          text: 'Built a production system handling 2.5M daily transactions.',
        },
      ],
    },
  ],
  projects: [
    {
      id: 'meal-planner',
      name: 'Meal Planner',
      repo: 'rwendell/meal-planner',
      description: 'A multi-user TypeScript application.',
      highlights: [
        {
          id: 'meal-multiuser',
          text: 'Built authentication and real-time shared data.',
        },
      ],
    },
  ],
});

const job: Job = {
  title: 'Next.js + Supabase developer',
  company: '',
  url: 'https://www.upwork.com/jobs/Test',
  body: 'Build a system. Start your proposal with the word "pipeline".',
  source: 'test',
  details: {
    budget: '$35.00-$60.00',
    budgetType: 'hourly',
    client: 'Member since Nov 8, 2026',
  },
};

const baseOutput: ProposalOutput = {
  proposal:
    'pipeline — I built a production system handling 2.5M daily transactions. I can overlap 12:00–18:00 UK time.',
  screening_answers: [{ question: 'Q1', answer: 'A1' }],
  samples: [
    {
      evidence: 'project:meal-planner',
      title: 'Meal Planner',
      why: 'Multi-user TypeScript application.',
    },
  ],
  claims: [
    {
      claim: 'Built a production system handling 2.5M daily transactions.',
      evidence: ['example-delivery'],
    },
    {
      claim: 'Can overlap 12:00–18:00 UK time.',
      evidence: ['config'],
    },
  ],
  evidence: ['example-delivery', 'config'],
  gaps: [],
  fit: { verdict: 'stretch', concerns: ['No Next.js experience.'] },
  rate: null,
};

const settings = {
  rate: null,
  availability: 'More than 30 hrs/week',
  bannedPhrases: ['I hope this message finds you well'],
  minWords: 1,
  maxWords: 200,
  maxChars: 5000,
};

describe('proposal verification', () => {
  it('accepts a grounded proposal and ignores time values in number checks', () => {
    const result = verifyProposal({
      output: baseOutput,
      career,
      settings,
      job,
      questions: ['Q1'],
      requiredOpening: 'pipeline',
      profile: null,
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('rejects unknown evidence ids', () => {
    const result = verifyProposal({
      output: {
        ...baseOutput,
        samples: [{ evidence: 'github:does-not-exist' }],
      },
      career,
      settings,
      job,
      requiredOpening: 'pipeline',
    });
    expect(result.errors).toContain(
      'samples[0] cites unknown evidence "github:does-not-exist"',
    );
  });

  it('rejects a rate that does not match the configured rate', () => {
    const result = verifyProposal({
      output: {
        ...baseOutput,
        rate: { type: 'hourly', amount: 90, currency: 'USD' },
      },
      career,
      settings: {
        ...settings,
        rate: { type: 'hourly', amount: 85, currency: 'USD' },
      },
      job,
      requiredOpening: 'pipeline',
    });
    expect(result.errors).toContain(
      'rate hourly 90 does not match the configured hourly 85',
    );
  });

  it('rejects a location claim without a source', () => {
    const noLocationCareer = CareerSchema.parse({
      ...career,
      basics: undefined,
    });
    const result = verifyProposal({
      output: {
        ...baseOutput,
        proposal: 'pipeline — I am based in the United States.',
        claims: [
          {
            claim: 'I am based in the United States.',
            evidence: ['example-delivery'],
          },
        ],
        evidence: ['example-delivery'],
      },
      career: noLocationCareer,
      settings,
      job,
      requiredOpening: 'pipeline',
      profile: null,
    });
    expect(result.errors).toContain(
      'proposal asserts a U.S. location or work authorization that is not in the career fact bank or hint',
    );
  });

  it('rejects a missing required opening', () => {
    const result = verifyProposal({
      output: { ...baseOutput, proposal: 'Hello, I built a system.' },
      career,
      settings,
      job,
      requiredOpening: 'pipeline',
    });
    expect(result.errors).toContain(
      'proposal must start with "pipeline" because the job description requires it',
    );
  });
});
