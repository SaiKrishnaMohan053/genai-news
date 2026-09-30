import type { ResearchRunnerInput, ResearchRunnerResult } from '@genai-news/agents';

import type { ResearchBudget, ResearchContext, ResearchSourceCatalog } from '@genai-news/shared';

import { describe, expect, it, vi } from 'vitest';

import {
  createResearchAgentExecutor,
  type ResearchRunnerRuntime,
} from '../src/research/research-executor.js';

const budget: ResearchBudget = {
  maxToolCalls: 6,
  maxModelCalls: 4,
  timeoutMs: 30_000,
  maxSelectedSources: 5,
  maxUnresolvedQuestions: 3,
  maxQuestionLength: 300,
};

const context: ResearchContext = {
  researchRunId: 'research-run-1',

  request: {
    storyId: 'story-1',

    researchGoal: 'Find stronger source coverage.',
  },

  story: {
    id: 'story-1',

    canonicalTitle: 'Example research story',

    firstPublishedAt: new Date('2026-09-29T12:00:00.000Z'),

    lastPublishedAt: new Date('2026-09-29T13:00:00.000Z'),
  },

  capturedAt: new Date('2026-09-29T18:00:00.000Z'),

  existingArticleIds: ['article-1'],
};

const catalog: ResearchSourceCatalog = {
  researchRunId: 'research-run-1',

  storyId: 'story-1',

  sources: [
    {
      sourceId: 'source-1',

      url: 'https://example.com/story',

      canonicalUrl: 'https://example.com/story',

      title: 'Example source',

      publisherName: 'Example',

      publishedAt: new Date('2026-09-29T12:00:00.000Z'),

      observedAt: new Date('2026-09-29T18:00:00.000Z'),

      provenance: [
        {
          kind: 'story-member',

          articleId: 'article-1',
        },
      ],
    },
  ],
};

function createRuntime(): ResearchRunnerRuntime {
  return {
    context,

    getCatalog: () => catalog,

    toolCallingModel: {
      invoke: vi.fn(),
    } as ResearchRunnerInput['toolCallingModel'],

    structuredOutputModel: {
      invoke: vi.fn(),
    } as ResearchRunnerInput['structuredOutputModel'],

    toolPorts: {
      hasSource: vi.fn(() => true),

      searchNews: vi.fn(),

      fetchArticle: vi.fn(),

      searchOfficialSource: vi.fn(),

      findRelatedSources: vi.fn(),
    },
  };
}

const executionInput = {
  researchRunId: 'research-run-1',

  storyId: 'story-1',

  researchGoal: 'Find stronger source coverage.',

  budget,
};

describe('createResearchAgentExecutor', () => {
  it('runs the Phase 3 runner and derives a complete result', async () => {
    const runnerResult: ResearchRunnerResult = {
      status: 'selected',

      selection: {
        sourceIds: ['source-1'],

        primarySourceCandidateIds: ['source-1'],

        unresolvedQuestions: [],

        completionSuggestion: 'coverage-sufficient',
      },

      modelCalls: 2,

      toolCalls: 3,
    };

    const runAgent = vi.fn<(input: ResearchRunnerInput) => Promise<ResearchRunnerResult>>(
      async () => runnerResult,
    );

    const createRuntimeFactory = vi.fn(async () => createRuntime());

    const executor = createResearchAgentExecutor({
      createRuntime: createRuntimeFactory,

      runAgent,
    });

    const result = await executor(executionInput);

    expect(createRuntimeFactory).toHaveBeenCalledWith(executionInput);

    expect(runAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        context,

        budget,
      }),
    );

    expect(result).toEqual({
      outcome: 'complete',

      stopReason: 'criteria-satisfied',

      selection: runnerResult.selection,

      modelCalls: 2,

      toolCalls: 3,
    });
  });

  it('maps a runner budget stop to a normal partial result', async () => {
    const runAgent = vi.fn(async (): Promise<ResearchRunnerResult> => ({
      status: 'stopped',

      reason: 'tool-budget-exhausted',

      modelCalls: 2,

      toolCalls: 6,
    }));

    const executor = createResearchAgentExecutor({
      createRuntime: async () => createRuntime(),

      runAgent,
    });

    const result = await executor(executionInput);

    expect(result).toEqual({
      outcome: 'partial',

      stopReason: 'tool-budget-exhausted',

      selection: null,

      modelCalls: 2,

      toolCalls: 6,
    });
  });

  it('maps deadline exhaustion to a normal partial result', async () => {
    const runAgent = vi.fn(async (): Promise<ResearchRunnerResult> => ({
      status: 'stopped',

      reason: 'deadline-exceeded',

      modelCalls: 3,

      toolCalls: 2,
    }));

    const executor = createResearchAgentExecutor({
      createRuntime: async () => createRuntime(),

      runAgent,
    });

    const result = await executor(executionInput);

    expect(result).toEqual({
      outcome: 'partial',

      stopReason: 'deadline-exceeded',

      selection: null,

      modelCalls: 3,

      toolCalls: 2,
    });
  });

  it('rejects a runtime for another research run', async () => {
    const invalidRuntime = createRuntime();

    const executor = createResearchAgentExecutor({
      createRuntime: async () => ({
        ...invalidRuntime,

        context: {
          ...invalidRuntime.context,

          researchRunId: 'other-run',
        },
      }),

      runAgent: vi.fn(),
    });

    await expect(executor(executionInput)).rejects.toThrow(
      'Research runtime belongs to a different research run.',
    );
  });

  it('rejects a runtime for another story', async () => {
    const invalidRuntime = createRuntime();

    const executor = createResearchAgentExecutor({
      createRuntime: async () => ({
        ...invalidRuntime,

        context: {
          ...invalidRuntime.context,

          request: {
            ...invalidRuntime.context.request,

            storyId: 'other-story',
          },
        },
      }),

      runAgent: vi.fn(),
    });

    await expect(executor(executionInput)).rejects.toThrow(
      'Research runtime belongs to a different story.',
    );
  });

  it('rejects a runtime with a different research goal', async () => {
    const invalidRuntime = createRuntime();

    const executor = createResearchAgentExecutor({
      createRuntime: async () => ({
        ...invalidRuntime,

        context: {
          ...invalidRuntime.context,

          request: {
            ...invalidRuntime.context.request,

            researchGoal: 'Different goal',
          },
        },
      }),

      runAgent: vi.fn(),
    });

    await expect(executor(executionInput)).rejects.toThrow(
      'Research runtime goal does not match persisted research state.',
    );
  });
});
