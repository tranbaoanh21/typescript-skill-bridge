import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

const normalizedEmail = z
  .string()
  .trim()
  .email()
  .max(320)
  .transform((email) => email.toLowerCase());
const password = z.string().min(12).max(128);
const refreshToken = z.string().min(64).max(256);

export const registerSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  email: normalizedEmail,
  password,
});

export const loginSchema = z.object({
  email: normalizedEmail,
  password: z.string().min(1).max(128),
});

export const refreshSchema = z.object({ refreshToken });
export const logoutSchema = z.object({ refreshToken });
