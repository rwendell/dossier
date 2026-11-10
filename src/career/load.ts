import { existsSync, readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { careerFile, privateCareerFile } from '../config/paths.js';
import { CareerSchema, type Career } from './schema.js';

export interface LoadedCareer {
  career: Career;
  publicPath: string;
  privatePath: string | null;
}

export function loadCareer(): LoadedCareer {
  if (!existsSync(careerFile)) {
    throw new Error(
      `Missing ${careerFile}. Run \`dossier init\` or \`dossier init --from <old-repo>\` first.`,
    );
  }

  const publicCareer = parseCareerFile(careerFile, 'career.yml');
  const hasPrivate = existsSync(privateCareerFile);
  const privateCareer = hasPrivate
    ? parseCareerFile(privateCareerFile, 'career.private.yml')
    : {};

  return {
    career: CareerSchema.parse(mergeValue(publicCareer, privateCareer)),
    publicPath: careerFile,
    privatePath: hasPrivate ? privateCareerFile : null,
  };
}

function parseCareerFile(path: string, label: string): Record<string, unknown> {
  const raw = parseYaml(readFileSync(path, 'utf8')) ?? {};
  if (!isPlainObject(raw)) {
    throw new Error(`${label} must contain a YAML object.`);
  }
  return raw;
}

export function mergeValue(
  base: unknown,
  overlay: unknown,
): unknown {
  if (overlay === undefined) return base;
  if (base === undefined) return overlay;

  if (Array.isArray(base) && Array.isArray(overlay)) {
    return mergeArray(base, overlay);
  }

  if (isPlainObject(base) && isPlainObject(overlay)) {
    const result: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(overlay)) {
      result[key] = mergeValue(result[key], value);
    }
    return result;
  }

  return overlay;
}

function mergeArray(base: unknown[], overlay: unknown[]): unknown[] {
  if (overlay.length === 0) return base;
  if (base.length === 0) return overlay;

  if (
    base.every((value) => typeof value === 'string') &&
    overlay.every((value) => typeof value === 'string')
  ) {
    return [...new Set([...base, ...overlay])];
  }

  const key = arrayKey([...base, ...overlay]);
  if (!key) return overlay;

  const result = [...base];
  const positions = new Map<string, number>();
  result.forEach((item, index) => {
    if (isPlainObject(item) && item[key] != null) {
      positions.set(String(item[key]), index);
    }
  });

  for (const item of overlay) {
    const id = isPlainObject(item) ? item[key] : null;
    if (id == null || !positions.has(String(id))) {
      result.push(item);
      if (id != null) positions.set(String(id), result.length - 1);
      continue;
    }
    const index = positions.get(String(id))!;
    result[index] = mergeValue(result[index], item);
  }

  return result;
}

function arrayKey(items: unknown[]): string | null {
  const objects = items.filter(isPlainObject);
  if (objects.length !== items.length || objects.length === 0) return null;

  for (const key of ['id', 'name', 'evidence', 'network', 'institution']) {
    if (objects.every((item) => item[key] != null)) return key;
  }
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
