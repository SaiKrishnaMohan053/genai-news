import { z } from 'zod';

export const jobIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);

export const systemPingJobSchema = z.object({
  message: z.string().min(1).max(200),
  requestedAt: z.string().datetime({ offset: true }),
});

export type SystemPingJobPayload = z.infer<typeof systemPingJobSchema>;

export const newsDiscoveryJobSchema = z.object({
  sourceId: z.string().min(1).max(100),
  limit: z.number().int().positive().max(100),
  requestedAt: z.string().datetime({ offset: true }),
});

export type NewsDiscoveryJobPayload = z.infer<typeof newsDiscoveryJobSchema>;
