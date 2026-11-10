import type { Career } from '../career/schema.js';
import type { Resume } from './types.js';

export function applyBasicsUrlPolicy(
  resume: Resume,
  career: Career,
): string | null {
  const basics = resume?.basics;
  if (!basics || typeof basics !== 'object') return null;

  const sourceUrl = normalizeUrl(career.basics?.url);
  if (sourceUrl) {
    if (basics.url === sourceUrl) return null;
    basics.url = sourceUrl;
    return 'basics.url set from the career fact bank';
  }

  if (basics.url == null) return null;
  delete basics.url;
  return 'removed basics.url because the career fact bank has no website';
}

export function checkBasicsUrl(
  resume: Resume,
  career: Career,
): string | null {
  const resumeUrl = normalizeUrl(resume.basics?.url);
  const careerUrl = normalizeUrl(career.basics?.url);

  if (resumeUrl && !careerUrl) {
    return `basics.url "${resumeUrl}" is not in the career fact bank; add it there or remove it from the resume`;
  }
  if (resumeUrl && careerUrl && resumeUrl !== careerUrl) {
    return `basics.url changed: "${resumeUrl}" != "${careerUrl}"`;
  }
  return null;
}

function normalizeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.trim() || null;
}
