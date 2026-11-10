import { describe, expect, it } from 'vitest';
import { CareerSchema } from '../src/career/schema.js';
import type { Job } from '../src/job/types.js';
import { buildProposalPrompt } from '../src/proposal/prompt.js';
import {
  buildProposalSettings,
  ProposalConfigSchema,
} from '../src/upwork/settings.js';

const career = CareerSchema.parse({
  roles: [
    {
      id: 'example',
      company: 'Example Co',
      position: 'Engineer',
      achievements: [{ id: 'example-delivery', text: 'Built a system.' }],
    },
  ],
});

const job: Job = {
  title: 'Engineer',
  company: 'Acme',
  url: '',
  body: 'Build a TypeScript system.',
  source: 'test',
  details: {},
};

const settings = buildProposalSettings(
  ProposalConfigSchema.parse({}),
  {},
  null,
);

describe('proposal prompt', () => {
  it('includes a tailored resume and trace when present', () => {
    const prompt = buildProposalPrompt({
      career,
      job,
      slug: 'acme-engineer',
      candidates: [],
      profile: null,
      client: '',
      hint: '',
      settings,
      questions: [],
      requiredOpening: '',
      resume: { basics: { name: 'Ryan W.' } },
      trace: { bullets: [] },
    });
    expect(prompt).toContain('<tailored_resume>');
    expect(prompt).toContain('<resume_trace>');
  });

  it('omits resume sections when no tailored resume exists', () => {
    const prompt = buildProposalPrompt({
      career,
      job,
      slug: 'acme-engineer',
      candidates: [],
      profile: null,
      client: '',
      hint: '',
      settings,
      questions: [],
      requiredOpening: '',
    });
    expect(prompt).not.toContain('</tailored_resume>');
    expect(prompt).not.toContain('</resume_trace>');
  });
});
