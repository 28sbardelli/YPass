import { z } from 'zod';

const objectValue = z.record(z.string(), z.unknown());

export const sisConnectionCreateSchema = z.object({
  provider: z.enum(['mock', 'oneroster', 'skyward', 'schoology']),
  connectionName: z.string().trim().min(1).max(120),
  configuration: objectValue.default({}),
  credentials: z.record(z.string(), z.string()).default({}),
  active: z.boolean().default(true),
  syncIntervalSeconds: z.number().int().min(0).max(86_400).default(0),
  _csrf: z.string().optional(),
});

export const sisConnectionIdSchema = z.object({
  connectionId: z.string().uuid(),
});
