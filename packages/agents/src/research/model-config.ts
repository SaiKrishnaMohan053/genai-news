import { z } from 'zod';

const configSchema = z.strictObject({
  provider: z.literal('openai').default('openai'),
  model: z.literal('gpt-4.1-mini-2025-04-14').default('gpt-4.1-mini-2025-04-14'),
  maxOutputTokens: z.number().int().min(1024).max(8192).default(4096),
  timeoutMs: z.number().int().min(1000).max(120000).default(30000),
});

export type ResearchModelConfig = Readonly<z.infer<typeof configSchema>>;

export function parseResearchModelConfig(value: unknown): ResearchModelConfig {
  const result = configSchema.safeParse(value);

  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path.join('.') || 'config')),
    ];

    throw new Error(`Invalid research model configuration: ${fields.join(', ')}`);
  }

  return Object.freeze(result.data);
}

export function loadResearchModelConfig(
  env: Readonly<Record<string, string | undefined>>,
): ResearchModelConfig {
  return parseResearchModelConfig({
    provider: env.RESEARCH_MODEL_PROVIDER,
    model: env.RESEARCH_MODEL_NAME,
    maxOutputTokens:
      env.RESEARCH_MODEL_MAX_OUTPUT_TOKENS === undefined
        ? undefined
        : Number(env.RESEARCH_MODEL_MAX_OUTPUT_TOKENS),
    timeoutMs:
      env.RESEARCH_MODEL_TIMEOUT_MS === undefined
        ? undefined
        : Number(env.RESEARCH_MODEL_TIMEOUT_MS),
  });
}
