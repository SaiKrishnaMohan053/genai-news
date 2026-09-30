import type { DatabaseClient } from '@genai-news/database';

import { describe, expect, it } from 'vitest';

import { createProductionResearchRuntimeFactory } from '../src/research/research-production.js';

describe('production research runtime', () => {
  it('rejects a blank OpenAI API key', () => {
    expect(() =>
      createProductionResearchRuntimeFactory({
        database: {} as DatabaseClient,

        openAiApiKey: '   ',

        gnewsApiKey: 'gnews-test-key',

        environment: {},
      }),
    ).toThrow('Research model API key is required');
  });

  it('rejects a blank GNews API key', () => {
    expect(() =>
      createProductionResearchRuntimeFactory({
        database: {} as DatabaseClient,

        openAiApiKey: 'openai-test-key',

        gnewsApiKey: '   ',

        environment: {},
      }),
    ).toThrow('GNews API key must not be empty.');
  });

  it('rejects invalid research model configuration', () => {
    expect(() =>
      createProductionResearchRuntimeFactory({
        database: {} as DatabaseClient,

        openAiApiKey: 'openai-test-key',

        gnewsApiKey: 'gnews-test-key',

        environment: {
          RESEARCH_MODEL_NAME: 'unsupported-model',
        },
      }),
    ).toThrow('Invalid research model configuration');
  });
});
