import { describe, expect, it } from 'vitest';
import { CareerSchema } from '../src/career/schema.js';
import type { Job } from '../src/job/types.js';
import { rankProjects } from '../src/projects/rank.js';
import type { GitHubData, LocalProjectsData } from '../src/projects/types.js';

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

const job: Job = {
  title: 'TypeScript React dashboard engineer',
  company: 'Acme',
  url: '',
  body: 'Build a TypeScript React dashboard with real-time data and SQL.',
  source: 'test',
  details: {},
};

const github: GitHubData = {
  owner: 'rwendell',
  syncedAt: new Date().toISOString(),
  repos: [
    {
      name: 'dashboard-kit',
      fullName: 'rwendell/dashboard-kit',
      source: 'github',
      evidence: 'github:dashboard-kit',
      description: 'React dashboard components in TypeScript',
      topics: ['react', 'typescript'],
      languages: ['TypeScript'],
      readme: 'A dashboard toolkit with charts and real-time data.',
      pushedAt: '2026-01-01',
      included: true,
    },
    {
      name: 'meal-planner',
      fullName: 'rwendell/meal-planner',
      source: 'github',
      evidence: 'github:meal-planner',
      description: 'Meal planning',
      languages: ['TypeScript'],
      readme: 'TypeScript React app.',
      included: true,
    },
    {
      name: 'unrelated',
      fullName: 'rwendell/unrelated',
      source: 'github',
      evidence: 'github:unrelated',
      description: 'A Go CLI',
      languages: ['Go'],
      readme: 'Go command line tool.',
      included: false,
      reasons: ['no README or description'],
    },
  ],
};

const local: LocalProjectsData = {
  root: '/projects',
  syncedAt: new Date().toISOString(),
  projects: [
    {
      name: 'sql-tools',
      displayName: 'SQL Tools',
      source: 'local',
      evidence: 'local:sql-tools',
      description: 'SQL migration helpers',
      languages: ['TypeScript'],
      readme: 'TypeScript SQL tooling.',
      localCommits: ['Add dashboard query helper'],
      included: true,
    },
  ],
};

describe('project candidate ranking', () => {
  it('ranks keyword matches and excludes curated repos', () => {
    const result = rankProjects(github, local, career, job, 12);
    expect(result.tokens).toContain('typescript');
    expect(result.selected[0]?.evidence).toBe('github:dashboard-kit');
    expect(
      result.selected.some(
        (candidate) => candidate.evidence === 'github:meal-planner',
      ),
    ).toBe(false);
    expect(
      result.selected.some(
        (candidate) => candidate.evidence === 'local:sql-tools',
      ),
    ).toBe(true);
    expect(
      result.selected.some(
        (candidate) => candidate.evidence === 'github:unrelated',
      ),
    ).toBe(false);
  });

  it('returns no candidates when there is no project metadata', () => {
    const result = rankProjects(null, null, career, job);
    expect(result.selected).toEqual([]);
  });
});
