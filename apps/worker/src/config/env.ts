import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  REDIS_URL: z.string().url(),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  OTEL_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export type WorkerEnv = z.infer<typeof envSchema>;

export function loadWorkerEnv(input: NodeJS.ProcessEnv = process.env): WorkerEnv {
  const result = envSchema.safeParse(input);

  if (!result.success) {
    throw new Error(
      `Invalid worker environment configuration: ${JSON.stringify(
        result.error.flatten().fieldErrors,
      )}`,
    );
  }

  return result.data;
}
