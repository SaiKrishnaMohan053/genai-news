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
