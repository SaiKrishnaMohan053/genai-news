import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  REDIS_URL: z.string().url(),

  WORKER_HEALTH_HOST: z.string().min(1).default('0.0.0.0'),

  WORKER_HEALTH_PORT: z.coerce.number().int().positive().max(65535).default(3002),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  OTEL_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),

  DATABASE_URL: z.string().url(),

  GNEWS_API_KEY: z.string().trim().min(1),

  NEWS_FRESHNESS_HOURS: z.coerce.number().positive().default(24),

  NEWS_MAX_FUTURE_SKEW_MINUTES: z.coerce.number().nonnegative().default(5),

  OPENAI_API_KEY: z.string().trim().min(1),

  STORY_EMBEDDING_MODEL: z.string().trim().min(1).default('text-embedding-3-small'),

  STORY_CANDIDATE_WINDOW_HOURS: z.coerce.number().positive().default(24),

  STORY_INCLUDE_UNKNOWN_TIME: z
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
