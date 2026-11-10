export interface GitHubRepo {
  name: string;
  displayName?: string;
  fullName?: string;
  owner?: string;
  source?: 'github' | 'org';
  visibility?: string;
  evidence?: string;
  url?: string;
  homepage?: string;
  description?: string;
  topics?: string[];
  languages?: string[];
  stars?: number;
  pushedAt?: string;
  createdAt?: string;
  pinned?: boolean;
  included?: boolean;
  reasons?: string[];
  readme?: string;
}

export interface LocalProject {
  name: string;
  displayName?: string;
  source?: 'local';
  evidence?: string;
  path?: string;
  remote?: string;
  remoteFullName?: string;
  url?: string;
  description?: string;
  languages?: string[];
  topics?: string[];
  readme?: string;
  localCommits?: string[];
  userCommitCount?: number;
  lastCommit?: string;
  pushedAt?: string;
  pinned?: boolean;
  included?: boolean;
  reasons?: string[];
}

export interface GitHubData {
  owner: string;
  syncedAt: string;
  orgs?: string[];
  pinned?: string[];
  repos: GitHubRepo[];
}

export interface LocalProjectsData {
  root: string;
  syncedAt: string;
  projects: LocalProject[];
}

export interface ProjectCandidate {
  name: string;
  displayName: string;
  source: string;
  evidence: string;
  url: string;
  homepage: string;
  description: string;
  topics: string[];
  languages: string[];
  pinned: boolean;
  included: true;
  localPath?: string;
  localCommits: string[];
  remoteFullName?: string;
  readme: string;
}
