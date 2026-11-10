export interface ResumeLocation {
  address?: string;
  postalCode?: string;
  city?: string;
  countryCode?: string;
  region?: string;
  [key: string]: unknown;
}

export interface ResumeProfile {
  network?: string;
  username?: string;
  url?: string;
  [key: string]: unknown;
}

export interface ResumeBasics {
  name?: string;
  label?: string;
  image?: string;
  email?: string;
  phone?: string;
  url?: string;
  summary?: string;
  location?: ResumeLocation;
  profiles?: ResumeProfile[];
  [key: string]: unknown;
}

export interface ResumeWork {
  name?: string;
  position?: string;
  url?: string;
  startDate?: string;
  endDate?: string;
  summary?: string;
  highlights?: string[];
  [key: string]: unknown;
}

export interface ResumeProject {
  name?: string;
  description?: string;
  highlights?: string[];
  keywords?: string[];
  url?: string;
  [key: string]: unknown;
}

export interface ResumeSkillGroup {
  name?: string;
  level?: string;
  keywords?: string[];
  [key: string]: unknown;
}

export interface ResumeEducation {
  institution?: string;
  url?: string;
  area?: string;
  studyType?: string;
  startDate?: string;
  endDate?: string;
  score?: string;
  courses?: string[];
  [key: string]: unknown;
}

export interface Resume {
  $schema?: string;
  basics?: ResumeBasics;
  work?: ResumeWork[];
  projects?: ResumeProject[];
  skills?: ResumeSkillGroup[];
  education?: ResumeEducation[];
  [key: string]: unknown;
}

export interface TraceBullet {
  path: string;
  evidence?: string[];
  source?: string;
  [key: string]: unknown;
}

export interface TraceProject {
  name: string;
  evidence?: string[];
  source?: string;
  [key: string]: unknown;
}

export interface Trace {
  summary_evidence?: string[];
  bullets?: TraceBullet[];
  projects?: TraceProject[];
  requirements?: unknown[];
  gaps?: unknown[];
  [key: string]: unknown;
}

export interface TailoredDraft {
  resume: Resume;
  trace: Trace;
}
