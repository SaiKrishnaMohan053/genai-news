import type { BaseLanguageModelInput } from '@langchain/core/language_models/base';
import type { Runnable, RunnableConfig } from '@langchain/core/runnables';

import { ChatOpenAI } from '@langchain/openai';

import type { createResearchTools } from './tools.js';

import { researchAgentSelectionSchema, type ResearchAgentSelection } from '@genai-news/shared';

import { parseResearchModelConfig, type ResearchModelConfig } from './model-config.js';

import type { BaseMessage } from '@langchain/core/messages';
import type { AIMessage } from '@langchain/core/messages';

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

export type ResearchStructuredOutputModel = Runnable<
  BaseLanguageModelInput,
  ResearchAgentSelection
>;

export function createResearchStructuredOutputModel(
  model: ChatOpenAI,
): ResearchStructuredOutputModel {
  return model.withStructuredOutput(researchAgentSelectionSchema, {
    name: 'research_agent_selection',
    method: 'jsonSchema',
    strict: true,
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

export type ResearchToolCallingModel = Runnable<readonly BaseMessage[], AIMessage>;

type ResearchTool = ReturnType<typeof createResearchTools>[keyof ReturnType<
  typeof createResearchTools
>];

export function createResearchToolCallingModel(
  model: ChatOpenAI,
  tools: readonly ResearchTool[],
): ResearchToolCallingModel {
  return model.bindTools([...tools], {
    strict: true,
    tool_choice: 'auto',
    parallel_tool_calls: false,
  }) as ResearchToolCallingModel;
}
