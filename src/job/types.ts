export interface JobDetails {
  budget?: string;
  budgetType?: 'hourly' | 'fixed';
  workload?: string;
  duration?: string;
  experienceLevel?: string;
  projectType?: string;
  jobLocation?: string;
  posted?: string;
  skills?: string[];
  client?: string;
  clientLocation?: string;
  clientMemberSince?: string;
  [key: string]: unknown;
}

export interface Job {
  title: string;
  company: string;
  url: string;
  body: string;
  source: string;
  details: JobDetails;
}

export interface JobInputOptions {
  input?: string;
  title?: string;
  company?: string;
  url?: string;
  description?: string;
}
