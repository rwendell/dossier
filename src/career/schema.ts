import { z } from 'zod';

const PassthroughObject = z.object({}).passthrough();

export const LocationSchema = z
  .object({
    city: z.string().optional(),
    region: z.string().optional(),
    countryCode: z.string().optional(),
    postalCode: z.string().optional(),
  })
  .passthrough();

export const BasicsSchema = z
  .object({
    name: z.string().optional(),
    label: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    url: z.string().optional(),
    summary: z.string().optional(),
    location: LocationSchema.optional(),
    profiles: z.array(PassthroughObject).optional(),
  })
  .passthrough();

export const AchievementSchema = z
  .object({
    id: z.string(),
    text: z.string(),
    skills: z.array(z.string()).optional(),
    strength: z.number().optional(),
  })
  .passthrough();

export const RoleSchema = z
  .object({
    id: z.string(),
    company: z.string().optional(),
    position: z.string().optional(),
    url: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    summary: z.string().optional(),
    achievements: z.array(AchievementSchema).default([]),
  })
  .passthrough();

export const HighlightSchema = z
  .object({
    id: z.string(),
    text: z.string(),
    skills: z.array(z.string()).optional(),
  })
  .passthrough();

export const ProjectSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    repo: z.string().optional(),
    url: z.string().optional(),
    homepage: z.string().optional(),
    description: z.string().optional(),
    skills: z.array(z.string()).optional(),
    highlights: z.array(HighlightSchema).default([]),
  })
  .passthrough();

export const EducationSchema = z
  .object({
    id: z.string().optional(),
    institution: z.string().optional(),
    area: z.string().optional(),
    studyType: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  })
  .passthrough();

export const TransferableSchema = z
  .object({
    evidence: z.string(),
    terms: z.array(z.string()).default([]),
  })
  .passthrough();

export const CareerSchema = z
  .object({
    version: z.union([z.number(), z.string()]).optional(),
    basics: BasicsSchema.optional(),
    summary: z.string().optional(),
    generic: PassthroughObject.optional(),
    roles: z.array(RoleSchema).default([]),
    projects: z.array(ProjectSchema).default([]),
    education: z.array(EducationSchema).default([]),
    skills: z.array(z.unknown()).default([]),
    constraints: z.unknown().optional(),
    transferable: z.array(TransferableSchema).default([]),
    github: PassthroughObject.optional(),
    local: PassthroughObject.optional(),
  })
  .passthrough();

export type Career = z.infer<typeof CareerSchema>;
export type Role = z.infer<typeof RoleSchema>;
export type Achievement = z.infer<typeof AchievementSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Highlight = z.infer<typeof HighlightSchema>;
export type Education = z.infer<typeof EducationSchema>;
export type Transferable = z.infer<typeof TransferableSchema>;
