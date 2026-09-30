import {
  createResearchModel,
  createResearchStructuredOutputModel,
  createResearchToolCallingModel,
  loadResearchModelConfig,
} from '@genai-news/agents';

import { createStoryRepository, type DatabaseClient } from '@genai-news/database';

import { GNewsSource } from '@genai-news/tools';

import {
  createResearchRuntimeFactory,
  type ResearchRuntimeModelFactory,
} from './research-runtime.js';

export type CreateProductionResearchRuntimeOptions = Readonly<{
  database: DatabaseClient;

  openAiApiKey: string;

  gnewsApiKey: string;

  environment?: Readonly<Record<string, string | undefined>>;
}>;

export function createProductionResearchRuntimeFactory(
  options: CreateProductionResearchRuntimeOptions,
) {
  const modelConfig = loadResearchModelConfig(options.environment ?? process.env);

  const model = createResearchModel(modelConfig, options.openAiApiKey);

  const gnews = new GNewsSource({
    apiKey: options.gnewsApiKey,
  });

  const models: ResearchRuntimeModelFactory = {
    createToolCallingModel: (tools) => createResearchToolCallingModel(model, Object.values(tools)),

    createStructuredOutputModel: () => createResearchStructuredOutputModel(model),
  };

  return createResearchRuntimeFactory({
    storyRepository: createStoryRepository(options.database),

    searchProvider: (input) => gnews.search(input),

    models,
  });
}
