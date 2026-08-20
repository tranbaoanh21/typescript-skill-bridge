import { z } from '../../shared/validation/zod.js';

export const idParamSchema = z.object({ id: z.uuid() });
export const slugParamSchema = z.object({ slug: z.string().min(1).max(120) });
export const projectIdParamSchema = z.object({ projectId: z.uuid() });
export const taskIdParamSchema = z.object({ taskId: z.uuid() });
export const applicationIdParamSchema = z.object({ applicationId: z.uuid() });

export const profileUpdateSchema = z
  .object({
    bio: z.string().trim().max(2_000).nullable().optional(),
    displayName: z.string().trim().min(2).max(120).optional(),
    graduationYear: z.int().min(2000).max(2200).nullable().optional(),
    major: z.string().trim().max(160).nullable().optional(),
    university: z.string().trim().min(2).max(160).optional(),
  })
  .refine((input) => Object.keys(input).length > 0, 'At least one profile field is required.');

export const userSkillsUpdateSchema = z.object({
  skills: z
    .array(z.object({ level: z.int().min(1).max(5), skillId: z.uuid() }))
    .max(30)
    .refine(
      (items) => new Set(items.map((item) => item.skillId)).size === items.length,
      'Skill IDs must be unique.',
    ),
});

const requiredSkills = z
  .array(
    z.object({
      desiredLevel: z.int().min(1).max(5),
      positions: z.int().min(1).max(50).default(1),
      skillId: z.uuid(),
    }),
  )
  .max(20)
  .refine(
    (items) => new Set(items.map((item) => item.skillId)).size === items.length,
    'Required skill IDs must be unique.',
  );

export const projectCreateSchema = z.object({
  capacity: z.int().min(1).max(100),
  description: z.string().trim().min(20).max(10_000),
  requiredSkills: requiredSkills.default([]),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(120),
  title: z.string().trim().min(3).max(180),
});

export const projectUpdateSchema = z
  .object({
    capacity: z.int().min(1).max(100).optional(),
    description: z.string().trim().min(20).max(10_000).optional(),
    requiredSkills: requiredSkills.optional(),
    title: z.string().trim().min(3).max(180).optional(),
    version: z.int().positive(),
  })
  .refine(
    (input) => Object.keys(input).some((key) => key !== 'version'),
    'At least one project field is required.',
  );

export const projectTransitionSchema = z.object({
  action: z.enum(['PUBLISH', 'START', 'COMPLETE', 'CANCEL', 'ARCHIVE']),
  version: z.int().positive(),
});

export const projectListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  page: z.coerce.number().int().min(1).default(1),
  search: z.string().trim().max(120).optional(),
  skill: z.string().trim().max(80).optional(),
  status: z.enum(['RECRUITING', 'ACTIVE', 'COMPLETED']).default('RECRUITING'),
});

export const applicationCreateSchema = z.object({
  coverLetter: z.string().trim().min(20).max(5_000),
});

export const applicationDecisionSchema = z.object({
  decision: z.enum(['ACCEPTED', 'REJECTED']),
  note: z.string().trim().max(2_000).optional(),
});

export const sprintCreateSchema = z
  .object({
    endsOn: z.iso.date(),
    goal: z.string().trim().max(2_000).optional(),
    name: z.string().trim().min(2).max(120),
    startsOn: z.iso.date(),
  })
  .refine((input) => input.startsOn <= input.endsOn, {
    message: 'Sprint start date must not be after its end date.',
    path: ['endsOn'],
  });

const assigneeIds = z
  .array(z.uuid())
  .max(30)
  .refine((ids) => new Set(ids).size === ids.length, 'Assignee IDs must be unique.');

export const taskCreateSchema = z.object({
  assigneeIds: assigneeIds.default([]),
  description: z.string().trim().max(10_000).optional(),
  dueAt: z.iso.datetime().optional(),
  position: z.int().min(0).default(0),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  sprintId: z.uuid().optional(),
  title: z.string().trim().min(2).max(180),
});

export const taskUpdateSchema = z
  .object({
    assigneeIds: assigneeIds.optional(),
    description: z.string().trim().max(10_000).optional(),
    dueAt: z.iso.datetime().optional(),
    position: z.int().min(0).optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
    sprintId: z.uuid().optional(),
    status: z.enum(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE']).optional(),
    title: z.string().trim().min(2).max(180).optional(),
    version: z.int().positive(),
  })
  .refine(
    (input) => Object.keys(input).some((key) => key !== 'version'),
    'At least one task field is required.',
  );

export const accountStatusSchema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) });

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type UserSkillsUpdateInput = z.infer<typeof userSkillsUpdateSchema>;
export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;
export type ProjectTransitionInput = z.infer<typeof projectTransitionSchema>;
export type ProjectListQuery = z.infer<typeof projectListQuerySchema>;
export type ApplicationCreateInput = z.infer<typeof applicationCreateSchema>;
export type ApplicationDecisionInput = z.infer<typeof applicationDecisionSchema>;
export type SprintCreateInput = z.infer<typeof sprintCreateSchema>;
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;
