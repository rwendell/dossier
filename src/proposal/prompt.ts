import { stringify as stringifyYaml } from 'yaml';
import type { Career } from '../career/schema.js';
import type { Job } from '../job/types.js';
import type { Candidate } from '../evidence/verify.js';
import type { UpworkProfile } from '../upwork/profile.js';
import type { ProposalSettings } from '../upwork/settings.js';

export interface ProposalPromptInput {
  career: Career;
  job: Job;
  slug: string;
  candidates: Candidate[];
  profile: UpworkProfile | null;
  client: string;
  hint: string;
  settings: ProposalSettings;
  questions: string[];
  requiredOpening: string;
}

export function buildProposalPrompt({
  career,
  job,
  slug,
  candidates,
  profile,
  client,
  hint,
  settings,
  questions,
  requiredOpening,
}: ProposalPromptInput): string {
  const sections: string[] = [
    '<application>',
    `company: ${job.company || '(not provided)'}`,
    `title: ${job.title}`,
    `url: ${job.url || '(not provided)'}`,
    `slug: ${slug}`,
    '</application>',
    '',
    '<job_description>',
    job.body || job.title,
    '</job_description>',
  ];

  if (job.details && Object.keys(job.details).length > 0) {
    sections.push(
      '',
      '<job_details>',
      stringifyYaml(job.details).trim(),
      '</job_details>',
    );
  }

  if (profile) {
    sections.push(
      '',
      '<upwork_profile>',
      stringifyYaml({
        url: profile.url,
        name: profile.name,
        title: profile.title,
        location: profile.location,
        rate: profile.rate,
        hoursPerWeek: profile.hoursPerWeek,
        summary: profile.summary,
        skills: profile.skills,
        portfolio: profile.portfolio,
      }).trim(),
      '</upwork_profile>',
    );
  }

  if (client) {
    sections.push('', '<client_context>', client, '</client_context>');
  }
  if (hint) {
    sections.push('', '<hint>', hint, '</hint>');
  }

  sections.push(
    '',
    '<career>',
    stringifyYaml(career).trim(),
    '</career>',
    '',
    '<project_candidates>',
    JSON.stringify(candidates, null, 2),
    '</project_candidates>',
    '',
    'Project entries may come from personal GitHub, organizations, or local ~/projects repositories. Cite the entry\'s `evidence` value.',
    '',
    '<upwork_defaults>',
    stringifyYaml({
      rate: settings.rate,
      includeRate: settings.includeRate,
      availability: settings.availability || null,
      includeAvailability: settings.includeAvailability,
      timezone: settings.timezone || null,
      timeline: settings.timeline || null,
      targetWords: settings.targetWords,
      minWords: settings.minWords,
      maxWords: settings.maxWords,
      preferredSamples: settings.preferredSamples,
    }).trim(),
    '</upwork_defaults>',
    '',
    '<screening_questions>',
    JSON.stringify(questions, null, 2),
    '</screening_questions>',
  );

  if (requiredOpening) {
    sections.push(
      '',
      '<required_opening>',
      requiredOpening,
      '</required_opening>',
    );
  }

  sections.push(
    '',
    'Write a proposal that is ready to paste into Upwork. Follow the job description\'s application instructions exactly, including any required opening word or phrase and any questions the client asks in the description.',
    '<upwork_profile> is the public Upwork profile. Use it for identity, location, skills, and portfolio context; the career fact bank takes precedence for employment, dates, metrics, and achievements. When `<upwork_defaults>` rate or availability differs from the profile, use `<upwork_defaults>`.',
    questions.length > 0
      ? 'Answer every supplied screening question separately in `screening_answers`, in the same order.'
      : 'If the job description contains explicit screening questions, include them in `screening_answers`.',
    'Use 1-3 `samples` for the project evidence most worth linking or attaching, and explain why each is relevant.',
    '`<upwork_defaults>.preferredSamples` is a soft preference list; use those samples when they fit, but do not force an irrelevant one.',
    'Keep plans, approach statements, opinions, and limitations out of `claims`. Put limitations in `gaps`; only candidate facts belong in `claims`.',
    'Never assert a current location, work authorization, citizenship, or residency unless it is explicit in the sources. If the job requires one and the sources are silent, put it in `gaps` and invite the client to confirm.',
    'Only state a rate, timeline, or availability that appears in `<upwork_defaults>`, `<client_context>`, or `<hint>`. If `includeRate` is false and the client did not ask for a rate, do not invent one.',
    'Return the JSON object described in your system prompt. Output JSON only.',
  );

  return sections.join('\n');
}
