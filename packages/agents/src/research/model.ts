import { ChatOpenAI } from '@langchain/openai';
import type { RunnableConfig } from '@langchain/core/runnables';
import { parseResearchModelConfig, type ResearchModelConfig } from './model-config.js';

export function createResearchModel(config: ResearchModelConfig, apiKey: string): ChatOpenAI {
  const validated = parseResearchModelConfig(config);

  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new Error('Research model API key is required');
  }

  return new ChatOpenAI({
    apiKey: apiKey.trim(),
    model: validated.model,
    useResponsesApi: false,
    temperature: 0,
    maxTokens: validated.maxOutputTokens,
    timeout: validated.timeoutMs,
    modelKwargs: {
      store: false,
    },
    configuration: {
      baseURL: 'https://api.openai.com/v1',
    },
    maxRetries: 0,
    maxConcurrency: 1,
  });
}

export function createResearchModelCallOptions(
  config: ResearchModelConfig,
  signal?: AbortSignal,
): RunnableConfig {
  const validated = parseResearchModelConfig(config);

  return {
    timeout: validated.timeoutMs,
    ...(signal === undefined ? {} : { signal }),
  };
}
