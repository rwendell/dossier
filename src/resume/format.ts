import type { Resume } from './types.js';

export function normalizeNumberSpacing(resume: Resume): boolean {
  let changed = false;
  const fix = (value: string): string => {
    const text = String(value);
    const next = text.replace(/(\d)\.\s+(\d)/g, '$1.$2');
    if (next !== text) changed = true;
    return next;
  };

  if (resume.basics?.summary) {
    resume.basics.summary = fix(resume.basics.summary);
  }
  for (const role of resume.work ?? []) {
    if (role.summary) role.summary = fix(role.summary);
    if (Array.isArray(role.highlights)) {
      role.highlights = role.highlights.map(fix);
    }
  }
  for (const project of resume.projects ?? []) {
    if (project.description) project.description = fix(project.description);
    if (Array.isArray(project.highlights)) {
      project.highlights = project.highlights.map(fix);
    }
  }

  return changed;
}

export function normalizeThemePunctuation(resume: Resume): boolean {
  let changed = false;

  for (const project of resume.projects ?? []) {
    if (!Array.isArray(project.highlights)) continue;
    project.highlights = project.highlights.map((highlight) => {
      const cleaned = String(highlight).replace(/[.!?]+$/, '').trim();
      if (cleaned !== highlight) changed = true;
      return cleaned;
    });
  }

  for (const group of resume.skills ?? []) {
    if (!Array.isArray(group.keywords)) continue;
    group.keywords = group.keywords.map((keyword) => {
      const cleaned = String(keyword).replace(/[.!?]+$/, '').trim();
      if (cleaned !== keyword) changed = true;
      return cleaned;
    });
  }

  return changed;
}
