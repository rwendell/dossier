import type { Career } from '../career/schema.js';
import type { Job } from '../job/types.js';
import type {
  GitHubData,
  LocalProjectsData,
  ProjectCandidate,
} from './types.js';

export interface ScoredProject {
  repo: GitHubData['repos'][number] | LocalProjectsData['projects'][number];
  matched: string[];
  /** Matches against name, description, topics, languages, and commits. */
  matchedStrong: string[];
  /** Matches only found in README text, which is noisier. */
  matchedWeak: string[];
  baseScore: number;
  pinned: boolean;
  score: number;
}

export interface RankProjectsResult {
  tokens: string[];
  scored: ScoredProject[];
  selected: ProjectCandidate[];
}

export function rankProjects(
  github: GitHubData | null,
  local: LocalProjectsData | null,
  career: Career,
  job: Job,
  limit = 12,
): RankProjectsResult {
  const repos = [
    ...(github?.repos ?? []).map((repo) => ({
      ...repo,
      source: repo.source || 'github',
      evidence:
        repo.evidence ||
        (repo.source === 'org' && repo.fullName
          ? `github:${repo.fullName}`
          : `github:${repo.name}`),
    })),
    ...(local?.projects ?? []).map((project) => ({
      ...project,
      source: 'local' as const,
      evidence: project.evidence || `local:${project.name}`,
      pushedAt: project.lastCommit,
    })),
  ].filter((repo) => repo.included !== false);

  const tokens = keywords(job.body || job.title);
  if (repos.length === 0) {
    return { tokens, scored: [], selected: [] };
  }

  const curatedRepos = new Set(
    career.projects
      .map((project) => project.repo)
      .filter(Boolean)
      .map((repo) => String(repo).split('/').pop()!.toLowerCase()),
  );

  const scored: ScoredProject[] = repos
    .filter(
      (repo) =>
        repo.source === 'local' ||
        !curatedRepos.has(repo.name.toLowerCase()),
    )
    .map((repo) => {
      const strongHaystack = [
        repo.name,
        'displayName' in repo ? repo.displayName : '',
        repo.description,
        ...(repo.topics ?? []),
        ...(repo.languages ?? []),
        ...('localCommits' in repo ? (repo.localCommits ?? []) : []),
      ]
        .join(' ')
        .toLowerCase();
      const readmeHaystack = String(repo.readme ?? '').toLowerCase();
      const matchedStrong = tokens.filter((token) =>
        strongHaystack.includes(token),
      );
      const matchedWeak = tokens.filter(
        (token) =>
          !matchedStrong.includes(token) &&
          readmeHaystack.includes(token),
      );
      return {
        repo,
        matched: [...matchedStrong, ...matchedWeak],
        matchedStrong,
        matchedWeak,
        baseScore: matchedStrong.length,
        pinned: Boolean(repo.pinned),
        score: matchedStrong.length * 5 + Math.min(matchedWeak.length, 5),
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.pinned) - Number(a.pinned) ||
        String(b.repo.pushedAt).localeCompare(String(a.repo.pushedAt)),
    );

  return {
    tokens,
    scored,
    selected: scored
      // README-only matches are usually incidental prose, not project
      // evidence, so require at least one structural match.
      .filter((entry) => entry.baseScore > 0)
      .slice(0, limit)
      .map(({ repo }) => toCandidate(repo)),
  };
}

export function selectProjects(
  github: GitHubData | null,
  local: LocalProjectsData | null,
  career: Career,
  job: Job,
  limit = 12,
): ProjectCandidate[] {
  return rankProjects(github, local, career, job, limit).selected;
}

function toCandidate(
  repo: GitHubData['repos'][number] | LocalProjectsData['projects'][number],
): ProjectCandidate {
  const local = repo as LocalProjectsData['projects'][number];
  const github = repo as GitHubData['repos'][number];
  return {
    name: repo.name,
    displayName: local.displayName || repo.name,
    source: repo.source || 'github',
    evidence: repo.evidence || `github:${repo.name}`,
    url: repo.url || local.remote || '',
    homepage: github.homepage || '',
    description: repo.description || '',
    topics: repo.topics ?? [],
    languages: repo.languages ?? [],
    pinned: Boolean(github.pinned),
    included: true,
    localPath: local.path || undefined,
    localCommits: local.localCommits ?? [],
    remoteFullName: local.remoteFullName || undefined,
    readme: String(repo.readme ?? '').slice(0, 2500),
  };
}

const STOPWORDS = new Set(
  `about above after again against all also and any are because been before being below between both but can could did does doing down during each few for from further had has have having here how into its itself just more most only other our out over own same should some such than that the their them then there these they this those through too under until very was were what when where which while who whom why will with would you your no nor not
  able across add added already also always another apply application applications around available back based become becomes best better big build building built call calls case cases change changes come comes company companies complete could create current currently day days different does done during each easy end enough even every example experience experienced feel find first fit following form found full get gets give gives go going good great group groups help high hire hiring idea important include includes including instead job jobs keep kind know last later least less let like likely long look looking lot low make makes many may maybe mean means might more most much must need needed needs new next note notes now off often old once one ones only open order other others over part per place plan please position positions possible post posted project projects provide provides put quick really right role roles run running same say see seem seems set several should show side since small some someone something start started still strong sure take taken task tasks team teams tell than that thing things think time times today together took try two under until use used useful uses using usually view want wants way ways week weeks well whole will work worked working works year years code etc eg top user users usage multiple non specific rather third side thing things`
    .split(/\s+/)
    .filter(Boolean),
);

function keywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    // Keep "." inside tokens for node.js and friends, but drop sentence
    // punctuation that survived the split, e.g. "businesses.".
    .map((word) => word.replace(/^\.+|\.+$/g, ''))
    .filter(
      (word) =>
        word.length > 2 &&
        !STOPWORDS.has(word) &&
        !/^\d+$/.test(word) &&
        /[a-z]/.test(word),
    );
  return [...new Set(words)];
}
