import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import {
  careerFile,
  privateCareerFile,
} from '../config/paths.js';
import { slugify } from '../util/slug.js';
import { CareerSchema, type Career } from './schema.js';

export interface ImportResumeOptions {
  force?: boolean;
}

export interface ImportResumeResult {
  careerPath: string;
  privatePath: string | null;
  roles: number;
  projects: number;
}

/**
 * Import a JSON Resume file into the dossier career fact bank. Contact details
 * go to career.private.yml; public work/project/skill data goes to career.yml.
 */
export function importJsonResume(
  input: string,
  { force = false }: ImportResumeOptions = {},
): ImportResumeResult {
  const inputPath = resolve(process.cwd(), input);
  if (!existsSync(inputPath) || !statSync(inputPath).isFile()) {
    throw new Error(
      `JSON Resume not found: ${inputPath}. Pass a .json file, not a json-resume checkout directory.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(inputPath, 'utf8')) as unknown;
  } catch (error) {
    throw new Error(
      `Could not parse ${inputPath}: ${(error as Error).message}`,
    );
  }
  if (!isPlainObject(parsed)) {
    throw new Error(`${inputPath} must contain a JSON Resume object.`);
  }

  const career = buildCareer(parsed);
  const privateOverlay = buildPrivateOverlay(parsed);

  if (existsSync(careerFile) && !force) {
    throw new Error(
      `${careerFile} already exists. Pass --force to replace it.`,
    );
  }
  if (privateOverlay && existsSync(privateCareerFile) && !force) {
    throw new Error(
      `${privateCareerFile} already exists. Pass --force to replace it.`,
    );
  }

  CareerSchema.parse(career);
  writeFileSync(careerFile, `${stringifyYaml(career).trim()}\n`);
  if (privateOverlay) {
    writeFileSync(
      privateCareerFile,
      `${stringifyYaml(privateOverlay).trim()}\n`,
    );
  }

  return {
    careerPath: careerFile,
    privatePath: privateOverlay ? privateCareerFile : null,
    roles: career.roles.length,
    projects: career.projects.length,
  };
}

export function buildCareer(resume: Record<string, unknown>): Career {
  const basics = isPlainObject(resume.basics) ? resume.basics : {};
  const roles = arrayOfObjects(resume.work).map((work, index) =>
    toRole(work, index),
  );
  const projects = arrayOfObjects(resume.projects).map((project, index) =>
    toProject(project, index),
  );
  const skills = Array.isArray(resume.skills)
    ? resume.skills
        .map((skill) => {
          if (typeof skill === 'string') return { name: skill };
          if (!isPlainObject(skill)) return null;
          return compact({
            name: str(skill.name),
            level: str(skill.level),
            keywords: stringArray(skill.keywords),
          });
        })
        .filter(Boolean)
    : [];

  const publicBasics = compact({
    label: str(basics.label),
    url: str(basics.url),
    summary: str(basics.summary),
    profiles: Array.isArray(basics.profiles)
      ? basics.profiles.filter(isPlainObject).map((profile) =>
          compact({
            network: str(profile.network),
            username: str(profile.username),
            url: str(profile.url),
          }),
        )
      : undefined,
  });

  const career = compact({
    version: 1,
    basics: Object.keys(publicBasics).length > 0 ? publicBasics : undefined,
    summary: str(basics.summary) || undefined,
    generic: str(basics.label)
      ? { title: str(basics.label) }
      : undefined,
    roles,
    projects,
    skills,
    education: arrayOfObjects(resume.education).map((entry) =>
      compact({
        id: slugify(str(entry.institution)) || undefined,
        institution: str(entry.institution),
        url: str(entry.url),
        area: str(entry.area),
        studyType: str(entry.studyType),
        startDate: str(entry.startDate),
        endDate: str(entry.endDate),
        score: str(entry.score),
      }),
    ),
    constraints: { doNotClaim: [] },
    transferable: [],
  });

  return CareerSchema.parse(career);
}

function toRole(
  work: Record<string, unknown>,
  index: number,
): Record<string, unknown> {
  const company =
    str(work.name) || str(work.company) || `Role ${index + 1}`;
  const id = slugify(company) || `role-${index + 1}`;
  const achievements = stringArray(work.highlights).map((text, position) => ({
    id: `${id}-${position + 1}`,
    text,
    strength: 3,
  }));

  return compact({
    id,
    company,
    position: str(work.position) || undefined,
    url: str(work.url) || undefined,
    startDate: str(work.startDate) || undefined,
    endDate: str(work.endDate) || undefined,
    summary: str(work.summary) || undefined,
    achievements,
  });
}

function toProject(
  project: Record<string, unknown>,
  index: number,
): Record<string, unknown> {
  const name = str(project.name) || `Project ${index + 1}`;
  const id = slugify(name) || `project-${index + 1}`;
  const url = str(project.url);
  const repo = url.match(/github\.com\/([^/]+\/[^/?#]+)/i)?.[1] ?? '';
  const highlights = stringArray(project.highlights).map(
    (text, position) => ({
      id: `${id}-${position + 1}`,
      text,
    }),
  );

  return compact({
    id,
    name,
    repo: repo || undefined,
    url: url || undefined,
    description: str(project.description) || undefined,
    highlights,
  });
}

export function buildPrivateOverlay(
  resume: Record<string, unknown>,
): Record<string, unknown> | null {
  if (!isPlainObject(resume.basics)) return null;
  const basics = compact({
    name: str(resume.basics.name) || undefined,
    email: str(resume.basics.email) || undefined,
    phone: str(resume.basics.phone) || undefined,
    location: isPlainObject(resume.basics.location)
      ? compact({
          city: str(resume.basics.location.city),
          region: str(resume.basics.location.region),
          countryCode: str(resume.basics.location.countryCode),
          postalCode: str(resume.basics.location.postalCode),
        })
      : undefined,
  });

  if (Object.keys(basics).length === 0) return null;
  return { basics };
}

function arrayOfObjects(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isPlainObject) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? '').trim()).filter(Boolean)
    : [];
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function compact(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry == null || entry === '') continue;
    if (Array.isArray(entry)) {
      if (entry.length === 0) continue;
      result[key] = entry;
    } else if (isPlainObject(entry)) {
      if (Object.keys(entry).length === 0) continue;
      result[key] = entry;
    } else {
      result[key] = entry;
    }
  }
  return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
