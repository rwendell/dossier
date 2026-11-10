import { stringify as stringifyYaml } from 'yaml';
import type { Career } from '../career/schema.js';
import type { Candidate } from '../evidence/verify.js';
import type { Job } from '../job/types.js';
import type { UpworkProfile } from '../upwork/profile.js';

export interface AnswerPromptInput {
  career: Career;
  job: Job;
  slug: string;
  question: string;
  hint: string;
  client: string;
  profile: UpworkProfile | null;
  candidates: Candidate[];
  resume?: unknown;
  trace?: unknown;
}

export function buildAnswerPrompt({
  career,
  job,
  slug,
  question,
  hint,
  client,
  profile,
  candidates,
  resume,
  trace,
}: AnswerPromptInput): string {
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
  );

  if (resume) {
    sections.push(
      '',
      '<tailored_resume>',
      JSON.stringify(resume, null, 2),
      '</tailored_resume>',
    );
  }
  if (trace) {
    sections.push(
      '',
      '<resume_trace>',
      JSON.stringify(trace, null, 2),
      '</resume_trace>',
    );
  }

  sections.push(
    '',
    '<question>',
    question,
    '</question>',
    '',
    'Answer the question using only the sources above. When a tailored resume is present, use it as the primary framing.',
    '<upwork_profile> is the public Upwork profile. Use it for identity, location, skills, and portfolio context; the career fact bank takes precedence for employment, dates, metrics, and achievements.',
    'Only state a rate, timeline, or availability that appears in `<client_context>` or `<hint>`; do not invent one.',
    'Never assert a current location, work authorization, citizenship, or residency unless it is explicit in the sources. If the question requires one and the sources are silent, put it in `gaps`.',
    'Keep plans, approach statements, opinions, and limitations out of `claims`. Put limitations in `gaps`; only candidate facts belong in `claims`.',
    'Return the JSON object described in your system prompt. Output JSON only.',
  );

  return sections.join('\n');
}
