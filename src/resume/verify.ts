import jsonResumeSchema from '@jsonresume/schema';
import type { Career } from '../career/schema.js';
import {
  buildAllowedYears,
  buildEvidenceMap,
  checkNumbers,
  type Candidate,
} from '../evidence/verify.js';
import { checkBasicsUrl } from './basics.js';
import { findExcludedSkills } from './skills.js';
import { hasTraceCoverage } from './trace.js';
import type { Resume, Trace } from './types.js';

export interface VerifyResumeInput {
  resume: Resume;
  trace: Trace;
  career: Career;
  candidates?: Candidate[];
}

export interface VerifyResumeResult {
  errors: string[];
  warnings: string[];
  gaps: string[];
}

export async function verifyTailoredResume({
  resume,
  trace,
  career,
  candidates = [],
}: VerifyResumeInput): Promise<VerifyResumeResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const gaps = Array.isArray(trace.gaps) ? trace.gaps.map(String) : [];

  const schemaResult = await validateResumeSchema(resume);
  errors.push(...schemaResult.errors);

  if (!hasTraceCoverage(resume, trace)) {
    errors.push(
      'trace coverage is incomplete: every work/project highlight needs a trace bullet, and every project needs a trace entry',
    );
  }

  const basicsError = checkBasicsUrl(resume, career);
  if (basicsError) errors.push(basicsError);

  const excludedSkills = findExcludedSkills(resume, career);
  if (excludedSkills.length > 0) {
    errors.push(
      `skills contain excluded terms: ${excludedSkills.join(', ')}`,
    );
  }

  const known = buildEvidenceMap(career, candidates, '');
  const allowedYears = buildAllowedYears(career);
  const bulletByPath = new Map(
    (trace.bullets ?? []).map((entry) => [entry.path, entry]),
  );
  const rolesByCompany = new Map(
    career.roles.map((role) => [normalizeCompany(role.company), role]),
  );

  for (const [index, work] of (resume.work ?? []).entries()) {
    const role = rolesByCompany.get(normalizeCompany(work.name));
    if (!role) {
      errors.push(
        `work[${index}] company "${work.name ?? ''}" is not in the career fact bank`,
      );
    } else {
      if (!dateMatches(role.startDate, work.startDate)) {
        errors.push(
          `work[${index}] startDate "${work.startDate ?? ''}" does not match the fact bank (${role.startDate ?? ''})`,
        );
      }
      if (!dateMatches(role.endDate, work.endDate)) {
        errors.push(
          `work[${index}] endDate "${work.endDate ?? ''}" does not match the fact bank (${role.endDate ?? ''})`,
        );
      }
      if (
        role.position &&
        work.position &&
        normalize(role.position) !== normalize(work.position)
      ) {
        warnings.push(
          `work[${index}] position "${work.position}" differs from the fact bank (${role.position})`,
        );
      }
    }

    const highlights = Array.isArray(work.highlights) ? work.highlights : [];
    for (const [highlightIndex, highlight] of highlights.entries()) {
      const path = `work[${index}].highlights[${highlightIndex}]`;
      verifyBullet({
        path,
        text: highlight,
        bulletByPath,
        known,
        allowedYears,
        errors,
        warnings,
      });
    }
  }

  const projectLookup = buildProjectLookup(career, candidates);
  for (const [index, project] of (resume.projects ?? []).entries()) {
    const name = project.name ?? '';
    const key = normalize(name);
    const matched = projectLookup.get(key);
    if (!matched) {
      errors.push(
        `projects[${index}] "${name}" is not in the career fact bank or project candidates`,
      );
    }

    const highlights = Array.isArray(project.highlights)
      ? project.highlights
      : [];
    for (const [highlightIndex, highlight] of highlights.entries()) {
      const path = `projects[${index}].highlights[${highlightIndex}]`;
      verifyBullet({
        path,
        text: highlight,
        bulletByPath,
        known,
        allowedYears,
        errors,
        warnings,
      });
    }
  }

  if (resume.basics?.summary) {
    const summaryEvidence = trace.summary_evidence ?? [];
    if (summaryEvidence.length === 0) {
      warnings.push('basics.summary has no trace.summary_evidence');
    }
    verifyEvidenceNumbers({
      text: resume.basics.summary,
      evidence: summaryEvidence,
      path: 'basics.summary',
      known,
      allowedYears,
      errors,
    });
  }

  return { errors, warnings, gaps };
}

export async function validateResumeSchema(
  resume: Resume,
): Promise<{ valid: boolean; errors: string[] }> {
  return new Promise((resolve) => {
    jsonResumeSchema.validate(resume, (validationErrors, valid) => {
      if (valid) {
        resolve({ valid: true, errors: [] });
        return;
      }
      const errors = (validationErrors ?? []).map((error) => {
        const property = error.property ? `${error.property} — ` : '';
        return `JSON Resume schema: ${property}${error.message ?? 'invalid'}`;
      });
      resolve({ valid: false, errors });
    });
  });
}

function verifyBullet({
  path,
  text,
  bulletByPath,
  known,
  allowedYears,
  errors,
  warnings,
}: {
  path: string;
  text: string;
  bulletByPath: Map<string, { evidence?: string[] }>;
  known: Map<string, string>;
  allowedYears: Set<string>;
  errors: string[];
  warnings: string[];
}): void {
  const bullet = bulletByPath.get(path);
  if (!bullet) {
    errors.push(`${path} has no trace bullet`);
    return;
  }
  const evidence = Array.isArray(bullet.evidence) ? bullet.evidence : [];
  if (evidence.length === 0) {
    errors.push(`${path} trace bullet has no evidence`);
    return;
  }
  verifyEvidenceNumbers({
    text,
    evidence,
    path,
    known,
    allowedYears,
    errors,
  });
  if (evidence.length > 3) {
    warnings.push(`${path} cites ${evidence.length} evidence ids`);
  }
}

function verifyEvidenceNumbers({
  text,
  evidence,
  path,
  known,
  allowedYears,
  errors,
}: {
  text: string;
  evidence: string[];
  path: string;
  known: Map<string, string>;
  allowedYears: Set<string>;
  errors: string[];
}): void {
  const texts: string[] = [];
  for (const id of evidence) {
    const source = known.get(id);
    if (!source) {
      errors.push(`${path} cites unknown evidence "${id}"`);
    } else {
      texts.push(source);
    }
  }
  if (texts.length > 0) {
    checkNumbers(text, texts.join('\n'), path, errors, allowedYears);
  }
}

function buildProjectLookup(
  career: Career,
  candidates: Candidate[],
): Map<string, unknown> {
  const map = new Map<string, unknown>();
  for (const project of career.projects) {
    if (project.name) map.set(normalize(project.name), project);
    if (project.repo) {
      map.set(normalize(project.repo.split('/').pop()), project);
    }
  }
  for (const candidate of candidates) {
    if (candidate.name) map.set(normalize(candidate.name), candidate);
    if (candidate.displayName) {
      map.set(normalize(candidate.displayName), candidate);
    }
  }
  return map;
}

function dateMatches(
  careerDate: string | undefined,
  resumeDate: string | undefined,
): boolean {
  if (!careerDate || !resumeDate) return true;
  const a = String(careerDate).match(/(\d{4})(?:-(\d{2}))?/);
  const b = String(resumeDate).match(/(\d{4})(?:-(\d{2}))?/);
  if (!a || !b) return true;
  if (a[1] !== b[1]) return false;
  if (a[2] && b[2] && a[2] !== b[2]) return false;
  return true;
}

function normalize(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeCompany(value: unknown): string {
  return normalize(
    String(value ?? '')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\b(inc|ltd|llc|corp|corporation|company)\b\.?/gi, ' '),
  );
}
