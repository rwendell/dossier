import type { Career } from '../career/schema.js';
import type { Resume } from './types.js';

export function filterExcludedSkills(
  resume: Resume,
  career: Career,
): string[] {
  const excluded = excludedSkillSet(career);
  if (excluded.size === 0) return [];

  const groups = Array.isArray(resume.skills) ? resume.skills : [];
  const removed: string[] = [];

  for (const group of groups) {
    if (!Array.isArray(group.keywords)) continue;
    group.keywords = group.keywords.filter((keyword) => {
      if (!excluded.has(normalizeSkill(keyword))) return true;
      removed.push(String(keyword));
      return false;
    });
  }

  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const keywords = groups[index]!.keywords;
    if (!Array.isArray(keywords) || keywords.length === 0) {
      groups.splice(index, 1);
    }
  }

  return [...new Set(removed)];
}

export function findExcludedSkills(
  resume: Resume,
  career: Career,
): string[] {
  const excluded = excludedSkillSet(career);
  if (excluded.size === 0) return [];

  const found: string[] = [];
  for (const group of resume.skills ?? []) {
    for (const keyword of group.keywords ?? []) {
      if (excluded.has(normalizeSkill(keyword))) found.push(String(keyword));
    }
  }
  return [...new Set(found)];
}

export function excludedSkillSet(career: Career): Set<string> {
  return new Set(career.skillExclude.map((skill) => normalizeSkill(skill)));
}

export function normalizeSkill(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
