import { stringify as stringifyYaml } from 'yaml';
import type { Career } from '../career/schema.js';
import type { Candidate } from '../evidence/verify.js';
import type { Job } from '../job/types.js';

export interface TailorPromptInput {
  career: Career;
  job: Job;
  slug: string;
  candidates: Candidate[];
}

export function buildTailorPrompt({
  career,
  job,
  slug,
  candidates,
}: TailorPromptInput): string {
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
    'The project entries above are candidates, not verified facts. They may come from personal GitHub, organizations, or local ~/projects repositories. Use a candidate only when it directly demonstrates a requirement and its README or local commit context supports the claim. Cite the entry\'s `evidence` value. Do not include a candidate merely because it is recent or pinned.',
    '',
    `Tailor the resume for the ${job.title} role${job.company ? ` at ${job.company}` : ''}.`,
    job.source === 'generic'
      ? 'This is a general-purpose resume, not a specific job. Follow the generic prioritization criteria in the job description.'
      : '',
    'The resume must fit on exactly one page and fill it. Return the JSON object described in your system prompt. Output JSON only.',
  );

  return sections.join('\n');
}
