import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  extractJobFromHtml,
  isUpworkSavedJobUrl,
  isUpworkSearchUrl,
} from '../src/job/page.js';

const html = readFileSync(
  new URL('./fixtures/upwork-job.html', import.meta.url),
  'utf8',
);

describe('Upwork job extraction', () => {
  it('extracts the title, body, and structured details', () => {
    const job = extractJobFromHtml(
      html,
      'https://www.upwork.com/jobs/Test_~022119',
    );

    expect(job.title).toBe('Next.js + Supabase developer');
    expect(job.company).toBe('');
    expect(job.body).toContain('used car dealer');
    expect(job.details.budget).toBe('$35.00-$60.00');
    expect(job.details.budgetType).toBe('hourly');
    expect(job.details.workload).toBe('Less than 30 hrs/week');
    expect(job.details.duration).toBe('6+ months');
    expect(job.details.experienceLevel).toBe('Expert');
    expect(job.details.projectType).toBe('Complex project');
    expect(job.details.jobLocation).toBe('Worldwide');
    expect(job.details.posted).toBe('Posted 6 hours ago');
    expect(job.details.skills).toContain('Next.js');
    expect(job.details.skills).not.toContain('+ 2 more');
    expect(job.details.client).toContain('Member since Nov 8, 2026');
    expect(job.details.clientLocation).toContain('United Kingdom');
  });

  it('rejects saved-jobs modal and search URLs before fetching', () => {
    expect(
      isUpworkSavedJobUrl(
        'https://www.upwork.com/nx/search/jobs/saved/details/~022119',
      ),
    ).toBe(true);
    expect(
      isUpworkSearchUrl('https://www.upwork.com/nx/search/jobs/?q=x'),
    ).toBe(true);
  });
});
