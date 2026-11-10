import { describe, expect, it } from 'vitest';
import { CareerSchema } from '../src/career/schema.js';
import {
  verifyAnswer,
  type AnswerOutput,
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
});

const baseOutput: AnswerOutput = {
  question: 'Tell me about a production system you built.',
  question_type: 'behavioral',
  answer:
    'I built a production system handling 2.5M daily transactions at Example Co.',
  claims: [
    {
      claim: 'Built a production system handling 2.5M daily transactions.',
      evidence: ['example-delivery'],
    },
  ],
  evidence: ['example-delivery'],
  gaps: [],
  follow_up: ['Prepare a metrics-focused version.'],
};

describe('answer verification', () => {
  it('accepts a grounded answer', () => {
    const result = verifyAnswer({ output: baseOutput, career });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('rejects an unknown evidence id', () => {
    const result = verifyAnswer({
      output: {
        ...baseOutput,
        claims: [{ claim: 'Built the system.', evidence: ['missing'] }],
        evidence: ['missing'],
      },
      career,
    });
    expect(result.errors).toContain(
      'claims[0] cites unknown evidence "missing"',
    );
  });

  it('warns when a hint is supplied but not cited', () => {
    const result = verifyAnswer({
      output: baseOutput,
      career,
      hint: 'Emphasize the Kafka migration.',
    });
    expect(result.warnings).toContain(
      'a hint was provided but no claims cite it; review whether the hint was used',
    );
  });

  it('warns about an unexpected question type', () => {
    const result = verifyAnswer({
      output: { ...baseOutput, question_type: 'cover-letter' },
      career,
    });
    expect(result.warnings).toContain(
      'unexpected question_type "cover-letter"',
    );
  });

  it('rejects a location claim without a source', () => {
    const noLocation = CareerSchema.parse({
      roles: career.roles,
    });
    const result = verifyAnswer({
      output: {
        ...baseOutput,
        answer: 'I am based in the United States and built the system.',
      },
      career: noLocation,
    });
    expect(result.errors).toContain(
      'proposal asserts a U.S. location or work authorization that is not in the career fact bank or hint',
    );
  });
});
