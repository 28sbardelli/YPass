import { z } from 'zod';

export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(
    /^[a-zA-Z0-9._-]+$/,
    'Username may contain letters, numbers, dots, underscores, and hyphens',
  );

export const passwordSchema = z.string().min(12).max(200);

export const emailSchema = z.string().trim().email().max(255);

export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(120),
  _csrf: z.string().optional(),
});

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(200),
  next: z.string().optional(),
  _csrf: z.string().optional(),
});

export const forgotSchema = z.object({
  email: emailSchema,
  _csrf: z.string().optional(),
});

export const resetSchema = z.object({
  token: z.string().min(16),
  password: passwordSchema,
  _csrf: z.string().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
  _csrf: z.string().optional(),
});

export const unlinkSchema = z.object({
  identityId: z.string().uuid(),
  currentPassword: z.string().optional(),
  _csrf: z.string().optional(),
});

export const pingEventSchema = z.object({
  message: z.string().max(200).optional(),
});
