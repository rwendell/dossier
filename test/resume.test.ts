import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CareerSchema } from '../src/career/schema.js';
import {
  collectUnusedAchievements,
  trimResume,
} from '../src/resume/one-page.js';
import { findTailoredResume } from '../src/resume/find.js';
import {
  fillProjectBulletTrace,
  hasTraceCoverage,
} from '../src/resume/trace.js';
import type { Resume, Trace } from '../src/resume/types.js';
import { verifyTailoredResume } from '../src/resume/verify.js';

const career = CareerSchema.parse({
  basics: {
    name: 'Ryan W.',
    label: 'Software Engineer',
    email: 'ryan@example.com',
    location: { city: 'Chicago', countryCode: 'US' },
  },
  roles: [
    {
      id: 'example',
      company: 'Example Co',
      position: 'Engineer',
      startDate: '2022-01',
      endDate: '2026-01',
      achievements: [
        {
          id: 'example-delivery',
          text: 'Built a production system handling 2.5M daily transactions.',
          strength: 5,
        },
        {
          id: 'example-docs',
          text: 'Wrote system specifications and troubleshooting guides.',
          strength: 3,
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

const resume: Resume = {
  $schema:
    'https://raw.githubusercontent.com/jsonresume/resume-schema/master/schema.json',
  basics: {
    name: 'Ryan W.',
    label: 'Software Engineer',
    email: 'ryan@example.com',
    summary: 'Built a production system handling 2.5M daily transactions.',
    location: { city: 'Chicago', countryCode: 'US' },
  },
  work: [
    {
      name: 'Example Co',
      position: 'Engineer',
      startDate: '2022-01',
      endDate: '2026-01',
      highlights: [
        'Built a production system handling 2.5M daily transactions.',
      ],
    },
  ],
  projects: [
    {
      name: 'Meal Planner',
      description: 'A multi-user TypeScript application.',
      highlights: ['Built authentication and real-time shared data.'],
    },
  ],
  skills: [{ name: 'Skills', keywords: ['TypeScript', 'SQL'] }],
};

const trace: Trace = {
  summary_evidence: ['example-delivery'],
  bullets: [
    {
      path: 'work[0].highlights[0]',
      evidence: ['example-delivery'],
    },
    {
      path: 'projects[0].highlights[0]',
      evidence: ['meal-multiuser'],
    },
  ],
  projects: [{ name: 'Meal Planner', evidence: ['meal-multiuser'] }],
  gaps: ['No Kubernetes experience in the fact bank.'],
};

describe('resume trace and one-page helpers', () => {
  it('checks trace coverage for work and project highlights', () => {
    expect(hasTraceCoverage(resume, trace)).toBe(true);
    expect(
      hasTraceCoverage(resume, { ...trace, bullets: [] }),
    ).toBe(false);
  });

  it('fills missing project highlight trace entries', () => {
    const draft = {
      resume: structuredClone(resume),
      trace: {
        ...structuredClone(trace),
        bullets: [trace.bullets![0]!],
      },
    };
    expect(hasTraceCoverage(draft.resume, draft.trace)).toBe(false);
    expect(fillProjectBulletTrace(draft)).toBe(true);
    expect(draft.trace.bullets).toHaveLength(2);
    expect(draft.trace.bullets?.[1]?.evidence).toEqual(['meal-multiuser']);
    expect(hasTraceCoverage(draft.resume, draft.trace)).toBe(true);
  });

  it('trims highlights, projects, skills, and trace entries', () => {
    const draft: Resume = {
      ...structuredClone(resume),
      work: [
        {
          ...resume.work![0]!,
          highlights: ['one', 'two', 'three', 'four', 'five', 'six', 'seven'],
        },
      ],
      projects: [
        ...Array.from({ length: 4 }, (_, index) => ({
          name: `Project ${index}`,
          highlights: ['x'],
        })),
      ],
      skills: [
        { name: 'Skills', keywords: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] },
      ],
    };
    const draftTrace: Trace = {
      bullets: [
        ...Array.from({ length: 7 }, (_, index) => ({
          path: `work[0].highlights[${index}]`,
          evidence: ['example-delivery'],
        })),
      ],
      projects: Array.from({ length: 4 }, (_, index) => ({
        name: `Project ${index}`,
      })),
    };

    expect(trimResume(draft, draftTrace, 0)).toBe(true);
    expect(draft.work![0]!.highlights).toHaveLength(6);
    expect(draft.projects).toHaveLength(3);
    expect(draft.skills![0]!.keywords).toHaveLength(7);
    expect(draftTrace.bullets).toHaveLength(6);
  });

  it('finds unused achievements by strength', () => {
    const unused = collectUnusedAchievements(career, trace);
    expect(unused).toHaveLength(1);
    expect(unused[0]?.achievement.id).toBe('example-docs');
  });
});

describe('tailored resume verification', () => {
  it('finds a tailored resume by slug', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dossier-resume-'));
    try {
      writeFileSync(join(dir, 'resume-acme.json'), JSON.stringify(resume));
      writeFileSync(join(dir, 'resume-acme.trace.json'), JSON.stringify(trace));
      const found = findTailoredResume('acme', dir);
      expect(found?.resume.basics?.name).toBe('Ryan W.');
      expect(found?.trace?.bullets).toHaveLength(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts a schema-valid, grounded resume and trace', async () => {
    const result = await verifyTailoredResume({
      resume,
      trace,
      career,
    });
    expect(result.errors).toEqual([]);
  });

  it('rejects a company that is not in the fact bank', async () => {
    const result = await verifyTailoredResume({
      resume: {
        ...resume,
        work: [{ ...resume.work![0]!, name: 'Fake Co' }],
      },
      trace,
      career,
    });
    expect(result.errors).toContain(
      'work[0] company "Fake Co" is not in the career fact bank',
    );
  });

  it('rejects a highlight without a trace bullet', async () => {
    const result = await verifyTailoredResume({
      resume,
      trace: { ...trace, bullets: [] },
      career,
    });
    expect(result.errors).toContain(
      'work[0].highlights[0] has no trace bullet',
    );
  });
});
