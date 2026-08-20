import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  API_HOST: z.string().min(1).default('0.0.0.0'),

  API_PORT: z.coerce.number().int().positive().max(65535).default(3001),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().url(),

  REDIS_URL: z.string().url(),
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(input: NodeJS.ProcessEnv = process.env): AppEnv {
  const result = envSchema.safeParse(input);

  if (!result.success) {
    const formattedErrors = result.error.flatten().fieldErrors;

    throw new Error(`Invalid environment configuration: ${JSON.stringify(formattedErrors)}`);
  }

  return result.data;
}
