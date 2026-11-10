import type { Career } from '../career/schema.js';
import type { Job } from '../job/types.js';
import { profileEvidenceText, type UpworkProfile } from '../upwork/profile.js';
import { extractNumbers, stripTimes } from './numbers.js';

export interface Claim {
  claim: string;
  evidence?: string[];
}

export interface Sample {
  evidence: string;
  title?: string;
  why?: string;
}

export interface ScreeningAnswer {
  question?: string;
  answer: string;
}

export interface RateValue {
  type: 'hourly' | 'fixed';
  amount: number;
  currency?: string;
}

export interface Fit {
  verdict: 'strong' | 'stretch' | 'weak';
  reasons?: string[];
  concerns?: string[];
}

export interface ProposalOutput {
  hook?: string;
  proposal: string;
  screening_answers?: ScreeningAnswer[];
  rate?: RateValue | null;
  timeline?: string | null;
  availability?: string | null;
  samples?: Sample[];
  claims?: Claim[];
  evidence?: string[];
  gaps?: string[];
  fit?: Fit | null;
}

export interface Candidate {
  name?: string;
  displayName?: string;
  source?: string;
  evidence?: string;
  description?: string;
  readme?: string;
  localCommits?: string[];
  fullName?: string;
}

export interface VerifySettings {
  rate?: RateValue | null;
  availability?: string;
  bannedPhrases?: string[];
  minWords?: number;
  maxWords?: number;
  maxChars?: number;
}

export interface VerifyResult {
  errors: string[];
  warnings: string[];
  claimCount: number;
  evidenceCount: number;
  gapCount: number;
  wordCount: number;
  charCount: number;
}

export interface VerifyProposalInput {
  output: ProposalOutput;
  career: Career;
  candidates?: Candidate[];
  hint?: string;
  client?: string;
  settings: VerifySettings;
  job: Job;
  questions?: string[];
  requiredOpening?: string;
  timeline?: string;
  profile?: UpworkProfile | null;
}

export function verifyProposal({
  output,
  career,
  candidates = [],
  hint = '',
  client = '',
  settings,
  job,
  questions = [],
  requiredOpening = '',
  timeline = '',
  profile = null,
}: VerifyProposalInput): VerifyResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const portfolioEvidence = Object.fromEntries(
    (profile?.portfolio ?? [])
      .filter((item) => item.evidence)
      .map((item) => [
        item.evidence,
        [item.title, ...item.tags].filter(Boolean).join('\n'),
      ]),
  );

  const known = buildEvidenceMap(career, candidates, hint, {
    client: [client, job.details?.client].filter(Boolean).join('\n\n'),
    config: JSON.stringify(settings, null, 2),
    job: [
      job.body,
      job.details ? JSON.stringify(job.details) : '',
    ]
      .filter(Boolean)
      .join('\n'),
    profile: profileEvidenceText(profile),
    ...portfolioEvidence,
  });
  const allowedYears = buildAllowedYears(career);

  const proposal =
    typeof output.proposal === 'string' ? output.proposal.trim() : '';
  const claims = Array.isArray(output.claims) ? output.claims : [];
  const evidence = Array.isArray(output.evidence) ? output.evidence : [];
  const gaps = Array.isArray(output.gaps) ? output.gaps : [];
  const answers = Array.isArray(output.screening_answers)
    ? output.screening_answers
    : [];
  const samples = Array.isArray(output.samples) ? output.samples : [];

  if (!proposal) errors.push('proposal is missing or empty');
  if (!Array.isArray(output.claims)) errors.push('claims is missing');
  if (!Array.isArray(output.evidence)) errors.push('evidence is missing');
  if (!Array.isArray(output.gaps)) warnings.push('gaps is missing');
  if (
    output.screening_answers != null &&
    !Array.isArray(output.screening_answers)
  ) {
    warnings.push('screening_answers is not an array');
  }
  if (output.samples != null && !Array.isArray(output.samples)) {
    warnings.push('samples is not an array');
  }

  verifyClaims({ claims, known, allowedYears, errors, warnings });
  verifyEvidence({ evidence, known, errors });
  verifyClaimEvidenceUnion({ claims, evidence, warnings });

  if (questions.length > 0) {
    if (answers.length !== questions.length) {
      errors.push(
        `expected ${questions.length} screening answer(s), got ${answers.length}`,
      );
    }
    questions.forEach((question, index) => {
      const entry = answers[index];
      if (!entry || typeof entry.answer !== 'string' || !entry.answer.trim()) {
        errors.push(`screening_answers[${index}] is missing an answer`);
        return;
      }
      if (
        entry.question &&
        normalizeQuestion(entry.question) !== normalizeQuestion(question)
      ) {
        warnings.push(
          `screening_answers[${index}] question does not match the supplied question`,
        );
      }
    });
  } else {
    answers.forEach((entry, index) => {
      if (!entry || typeof entry.answer !== 'string' || !entry.answer.trim()) {
        errors.push(`screening_answers[${index}] is missing an answer`);
      }
    });
  }

  samples.forEach((sample, index) => {
    if (!sample || typeof sample !== 'object') {
      errors.push(`samples[${index}] is not an object`);
      return;
    }
    if (!sample.evidence) {
      errors.push(`samples[${index}] has no evidence id`);
    } else if (!known.has(sample.evidence)) {
      errors.push(`samples[${index}] cites unknown evidence "${sample.evidence}"`);
    }
  });

  if (output.rate != null) {
    if (typeof output.rate !== 'object' || Array.isArray(output.rate)) {
      warnings.push('rate should be an object or null');
    } else {
      if (!['hourly', 'fixed'].includes(output.rate.type)) {
        warnings.push('rate.type should be "hourly" or "fixed"');
      }
      if (!(Number(output.rate.amount) > 0)) {
        warnings.push('rate.amount should be a positive number');
      }
      const configuredRate = settings.rate;
      if (!configuredRate) {
        errors.push(
          'rate is set but no rate was provided in proposal.yml or with --rate',
        );
      } else if (
        Number(output.rate.amount) !== Number(configuredRate.amount) ||
        output.rate.type !== configuredRate.type
      ) {
        errors.push(
          `rate ${output.rate.type} ${output.rate.amount} does not match the configured ${configuredRate.type} ${configuredRate.amount}`,
        );
      }
    }
  }

  if (
    output.timeline != null &&
    String(output.timeline).trim() &&
    !String(timeline ?? '').trim()
  ) {
    const timelineText = String(output.timeline).trim().toLowerCase();
    const jobTimeline = `${job.body}\n${JSON.stringify(job.details ?? {})}`.toLowerCase();
    if (!jobTimeline.includes(timelineText)) {
      errors.push(
        'timeline is set but no timeline was provided with --timeline, proposal.yml, or the job description',
      );
    }
  }

  if (
    output.availability != null &&
    String(output.availability).trim() &&
    !String(settings.availability ?? '').trim() &&
    !String(client ?? '').trim() &&
    !String(hint ?? '').trim()
  ) {
    errors.push(
      'availability is set but no availability was provided in proposal.yml, --availability, --client, or --hint',
    );
  }

  if (output.fit != null) {
    if (typeof output.fit !== 'object' || Array.isArray(output.fit)) {
      warnings.push('fit should be an object');
    } else if (!['strong', 'stretch', 'weak'].includes(output.fit.verdict)) {
      warnings.push('fit.verdict should be strong, stretch, or weak');
    }
  }

  if (proposal) {
    checkStyle({ proposal, settings, errors, warnings });
    checkRequiredOpening({ proposal, requiredOpening, errors });
    checkLocationClaims({ proposal, career, hint, profile, errors });
    checkInternalIds({ proposal, known, warnings });
  }

  return {
    errors,
    warnings,
    claimCount: claims.length,
    evidenceCount: evidence.length,
    gapCount: gaps.length,
    wordCount: countWords(proposal),
    charCount: proposal.length,
  };
}

export function buildEvidenceMap(
  career: Career,
  candidates: Candidate[] = [],
  hint = '',
  extraEvidence: Record<string, string> = {},
): Map<string, string> {
  const map = new Map<string, string>();
  if (hint) map.set('hint', hint);
  for (const [id, text] of Object.entries(extraEvidence)) {
    if (text) map.set(id, String(text));
  }

  for (const role of career.roles) {
    map.set(
      `role:${role.id}`,
      [
        role.company,
        role.position,
        role.startDate,
        role.endDate,
        role.summary,
      ]
        .filter(Boolean)
        .join('\n'),
    );
    for (const achievement of role.achievements) {
      map.set(achievement.id, achievement.text);
    }
  }

  for (const project of career.projects) {
    const projectText = [
      project.name,
      project.description,
      ...project.highlights.map((highlight) => highlight.text),
    ]
      .filter(Boolean)
      .join('\n');
    if (project.id) map.set(`project:${project.id}`, projectText);
    if (project.repo) {
      map.set(`github:${project.repo}`, projectText);
      map.set(
        `github:${project.repo.split('/').pop()}`,
        projectText,
      );
    }
    for (const highlight of project.highlights) {
      map.set(highlight.id, highlight.text);
    }
  }

  for (const entry of career.education) {
    const id = entry.id ?? String(entry.institution ?? '').toLowerCase();
    const text = [
      entry.institution,
      entry.area,
      entry.studyType,
      entry.startDate,
      entry.endDate,
    ]
      .filter(Boolean)
      .join(' ');
    map.set(`education:${id}`, text);
    map.set('education', text);
  }

  for (const candidate of candidates) {
    const text = [
      candidate.description,
      candidate.readme,
      ...(candidate.localCommits ?? []),
    ].join('\n');
    const evidence =
      candidate.evidence ||
      (candidate.source === 'local'
        ? `local:${candidate.name}`
        : candidate.source === 'org' && candidate.fullName
          ? `github:${candidate.fullName}`
          : `github:${candidate.name}`);

    map.set(evidence, text);
    if (candidate.source !== 'local') {
      map.set(`github:${candidate.name}`, text);
      if (candidate.fullName) map.set(`github:${candidate.fullName}`, text);
    }
  }

  return map;
}

function verifyClaims({
  claims,
  known,
  allowedYears,
  errors,
  warnings,
}: {
  claims: Claim[];
  known: Map<string, string>;
  allowedYears: Set<string>;
  errors: string[];
  warnings: string[];
}): void {
  claims.forEach((entry, index) => {
    if (!entry || typeof entry.claim !== 'string' || !entry.claim.trim()) {
      errors.push(`claims[${index}] is missing claim text`);
      return;
    }
    const ids = Array.isArray(entry.evidence) ? entry.evidence : [];
    if (ids.length === 0) {
      if (isNegativeClaim(entry.claim)) {
        warnings.push(
          `claims[${index}] is a limitation with no evidence; review it before sending`,
        );
      } else {
        errors.push(`claims[${index}] has no evidence`);
      }
      return;
    }

    const texts: string[] = [];
    for (const id of ids) {
      const text = known.get(id);
      if (!text) {
        errors.push(`claims[${index}] cites unknown evidence "${id}"`);
      } else {
        texts.push(text);
      }
    }
    if (texts.length > 0) {
      checkNumbers(
        entry.claim,
        texts.join('\n'),
        `claims[${index}]`,
        errors,
        allowedYears,
      );
    }
  });
}

function verifyEvidence({
  evidence,
  known,
  errors,
}: {
  evidence: string[];
  known: Map<string, string>;
  errors: string[];
}): void {
  evidence.forEach((id, index) => {
    if (!known.has(id)) {
      errors.push(`evidence[${index}] cites unknown evidence "${id}"`);
    }
  });
}

function verifyClaimEvidenceUnion({
  claims,
  evidence,
  warnings,
}: {
  claims: Claim[];
  evidence: string[];
  warnings: string[];
}): void {
  const evidenceSet = new Set(evidence);
  for (const [index, entry] of claims.entries()) {
    for (const id of entry.evidence ?? []) {
      if (!evidenceSet.has(id)) {
        warnings.push(
          `claims[${index}] evidence "${id}" is not in the top-level evidence list`,
        );
      }
    }
  }
}

function buildAllowedYears(career: Career): Set<string> {
  const years = new Set<string>();
  const add = (date: unknown) => {
    const match = String(date ?? '').match(/^(\d{4})/);
    if (match) years.add(match[1]!);
  };
  for (const role of career.roles) {
    add(role.startDate);
    add(role.endDate);
  }
  for (const entry of career.education) {
    add(entry.startDate);
    add(entry.endDate);
  }
  return years;
}

function checkNumbers(
  output: string,
  sourceText: string,
  path: string,
  errors: string[],
  allowedYears: Set<string>,
): void {
  const sourceNumbers = new Set(extractNumbers(stripTimes(sourceText)));
  for (const number of extractNumbers(stripTimes(output))) {
    if (allowedYears.has(number)) continue;
    if (!sourceNumbers.has(number)) {
      errors.push(
        `${path} contains "${number}", which is not in the cited evidence`,
      );
    }
  }
}

function checkStyle({
  proposal,
  settings,
  errors,
  warnings,
}: {
  proposal: string;
  settings: VerifySettings;
  errors: string[];
  warnings: string[];
}): void {
  const wordCount = countWords(proposal);
  const maxChars = Number(settings.maxChars);
  if (maxChars > 0 && proposal.length > maxChars) {
    errors.push(
      `proposal is ${proposal.length} characters; the configured limit is ${maxChars}`,
    );
  }

  const minWords = Number(settings.minWords);
  const maxWords = Number(settings.maxWords);
  if (minWords > 0 && wordCount < minWords) {
    warnings.push(
      `proposal is ${wordCount} words; target at least ${minWords}`,
    );
  }
  if (maxWords > 0 && wordCount > maxWords) {
    warnings.push(
      `proposal is ${wordCount} words; target at most ${maxWords}`,
    );
  }

  const lower = proposal.toLowerCase();
  for (const phrase of settings.bannedPhrases ?? []) {
    if (lower.includes(String(phrase).toLowerCase())) {
      warnings.push(`proposal contains the generic phrase "${phrase}"`);
    }
  }

  if (
    /\[(?:your|company|insert|name|role|client|date|rate|amount|x)[^\]]*\]/i.test(
      proposal,
    )
  ) {
    warnings.push(
      'proposal contains a placeholder bracket; replace it before sending',
    );
  }
}

function checkRequiredOpening({
  proposal,
  requiredOpening,
  errors,
}: {
  proposal: string;
  requiredOpening: string;
  errors: string[];
}): void {
  if (!requiredOpening) return;
  const expected = requiredOpening.toLowerCase().replace(/[.!]+$/, '').trim();
  if (!expected) return;
  if (!proposal.toLowerCase().startsWith(expected)) {
    errors.push(
      `proposal must start with "${requiredOpening}" because the job description requires it`,
    );
  }
}

function checkLocationClaims({
  proposal,
  career,
  hint,
  profile,
  errors,
}: {
  proposal: string;
  career: Career;
  hint: string;
  profile?: UpworkProfile | null;
  errors: string[];
}): void {
  const careerText = JSON.stringify(career);
  const hintText = String(hint ?? '');
  const careerCountry = String(
    career.basics?.location?.countryCode ?? '',
  ).toUpperCase();
  const profileUs =
    profile?.location?.countryCode === 'US' &&
    (!careerCountry || careerCountry === 'US');
  const hasUsSource =
    profileUs ||
    /"countryCode"\s*:\s*"US"/i.test(careerText) ||
    /"country"\s*:\s*"United States"/i.test(careerText) ||
    /\b(?:i(?:'m| am)|currently)\s+(?:based|located|residing|living)\s+in\s+(?:the\s+)?(?:united states|u\.s\.|usa|us)\b/i.test(
      hintText,
    ) ||
    /\b(?:u\.s\.|us|united states)[- ]based\b/i.test(hintText);
  if (hasUsSource) return;

  const patterns = [
    /\b(?:i(?:'m| am)|currently)\s+(?:based|located|residing|living)\s+in\s+(?:the\s+)?(?:united states|u\.s\.|usa|us)\b/i,
    /\b(?:i(?:'m| am)|currently)\s+(?:a\s+)?(?:u\.s\.|us|united states)[- ]based\b/i,
    /\bmy (?:current )?(?:location|residence)\b[^.\n]*\b(?:united states|u\.s\.|usa)\b/i,
    /\bauthorized to work in the (?:united states|u\.s\.|usa)\b/i,
    /\b(?:u\.s\.|united states)\s+(?:citizen|permanent resident)\b/i,
  ];
  if (patterns.some((pattern) => pattern.test(proposal))) {
    errors.push(
      'proposal asserts a U.S. location or work authorization that is not in the career fact bank or hint',
    );
  }
}

function checkInternalIds({
  proposal,
  known,
  warnings,
}: {
  proposal: string;
  known: Map<string, string>;
  warnings: string[];
}): void {
  for (const id of known.keys()) {
    if (
      id.length < 7 ||
      ['hint', 'client', 'config', 'job', 'education'].includes(id) ||
      (!id.includes(':') && !id.includes('-'))
    ) {
      continue;
    }
    if (proposal.includes(id)) {
      warnings.push(`proposal contains the internal evidence id "${id}"`);
    }
  }
}

function isNegativeClaim(value: string): boolean {
  return /\b(?:no|not|never|none|haven't|hasn't|hadn't|didn't|doesn't|don't|cannot|can't|without|lack|lacks|lacking)\b/i.test(
    String(value ?? ''),
  );
}

function countWords(value: string): number {
  return String(value ?? '')
    .split(/\s+/)
    .filter(Boolean).length;
}

function normalizeQuestion(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
