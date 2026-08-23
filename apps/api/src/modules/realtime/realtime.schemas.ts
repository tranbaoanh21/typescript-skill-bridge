import { z } from 'zod';

export const realtimeProjectParamsSchema = z.object({
  projectId: z.uuid(),
});

export const projectJoinSchema = realtimeProjectParamsSchema.extend({
  afterMessageId: z.uuid().optional(),
});

export const messageSendSchema = z.object({
  body: z.string().trim().min(1).max(2_000),
  clientMessageId: z.uuid(),
  projectId: z.uuid(),
});

export const typingSchema = z.object({
  active: z.boolean(),
  projectId: z.uuid(),
});

export const messageListQuerySchema = z.object({
  afterMessageId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
