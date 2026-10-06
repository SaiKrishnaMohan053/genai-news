import { AIMessage, ToolMessage } from '@langchain/core/messages';
import type { ResearchBudget, ResearchContext, ResearchSourceCatalog } from '@genai-news/shared';
import { describe, expect, it, vi } from 'vitest';

import { runResearchAgent, type ResearchRunnerInput } from '../src/research/research-runner.js';

const context: ResearchContext = {
  researchRunId: 'run-1',
  request: {
    storyId: 'story-1',
  },
  story: {
    id: 'story-1',
    canonicalTitle: 'AI announcement',
    firstPublishedAt: null,
    lastPublishedAt: null,
  },
  capturedAt: new Date(),
  existingArticleIds: ['article-1'],
};

const budget: ResearchBudget = {
  maxToolCalls: 3,
  maxModelCalls: 3,
  timeoutMs: 10_000,
  maxSelectedSources: 5,
  maxUnresolvedQuestions: 3,
  maxQuestionLength: 300,
};

function catalog(): ResearchSourceCatalog {
  return {
    researchRunId: 'run-1',
    storyId: 'story-1',
    sources: [
      {
        sourceId: 'source-1',
        url: 'https://example.com/story',
        canonicalUrl: 'https://example.com/story',
        title: 'Example',
        publisherName: 'Example',
        publishedAt: null,
        observedAt: new Date(),
        provenance: [
          {
            kind: 'story-member',
            articleId: 'article-1',
          },
        ],
      },
    ],
  };
}

function baseInput(): ResearchRunnerInput {
  return {
    context,
    budget,
    getCatalog: () => catalog(),

    toolCallingModel: {
      invoke: vi.fn(),
    } as unknown as ResearchRunnerInput['toolCallingModel'],

    structuredOutputModel: {
      invoke: vi.fn(),
    } as unknown as ResearchRunnerInput['structuredOutputModel'],

    toolPorts: {
      hasSource: (sourceId) => sourceId === 'source-1',

      searchNews: vi.fn(),
      searchOfficialSource: vi.fn(),
      findRelatedSources: vi.fn(),

      fetchArticle: vi.fn(),
    },
  };
}

describe('bounded research agent runner', () => {
  it('finalizes a run with no tool calls', async () => {
    const input = baseInput();

    vi.mocked(input.toolCallingModel.invoke).mockResolvedValue(
      new AIMessage({
        content: 'Ready to finalize.',
        tool_calls: [],
      }),
    );

    vi.mocked(input.structuredOutputModel.invoke).mockResolvedValue({
      sourceIds: ['source-1'],
      primarySourceCandidateIds: [],
      unresolvedQuestions: [],
      completionSuggestion: 'coverage-sufficient',
    });

    const result = await runResearchAgent(input);

    expect(result).toEqual({
      status: 'selected',
      selection: {
        sourceIds: ['source-1'],
        primarySourceCandidateIds: [],
        unresolvedQuestions: [],
        completionSuggestion: 'coverage-sufficient',
      },
      modelCalls: 2,
      toolCalls: 0,
    });
  });

  it('executes a requested tool before continuing', async () => {
    const input = baseInput();

    vi.mocked(input.toolCallingModel.invoke)
      .mockResolvedValueOnce(
        new AIMessage({
          content: '',
          tool_calls: [
            {
              type: 'tool_call',
              id: 'call-1',
              name: 'fetch_article',
              args: {
                sourceId: 'source-1',
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        new AIMessage({
          content: 'Done researching.',
          tool_calls: [],
        }),
      );

    vi.mocked(input.toolPorts.fetchArticle).mockResolvedValue({
      status: 'ok',
      sourceId: 'source-1',
      text: 'Article text',
      fetchedAt: '2026-09-29T20:00:00.000Z',
      truncated: false,
    });

    vi.mocked(input.structuredOutputModel.invoke).mockResolvedValue({
      sourceIds: ['source-1'],
      primarySourceCandidateIds: [],
      unresolvedQuestions: [],
      completionSuggestion: 'coverage-sufficient',
    });

    const result = await runResearchAgent(input);

    expect(input.toolPorts.fetchArticle).toHaveBeenCalledTimes(1);

    expect(result).toMatchObject({
      status: 'selected',
      modelCalls: 3,
      toolCalls: 1,
    });
  });

  it('reserves the final model call for structured selection', async () => {
    const input: ResearchRunnerInput = {
      ...baseInput(),
      budget: {
        ...budget,
        maxModelCalls: 1,
      },
    };

    vi.mocked(input.structuredOutputModel.invoke).mockResolvedValue({
      sourceIds: ['source-1'],
      primarySourceCandidateIds: [],
      unresolvedQuestions: [],
      completionSuggestion: 'coverage-sufficient',
    });

    const result = await runResearchAgent(input);

    expect(result).toEqual({
      status: 'selected',
      selection: {
        sourceIds: ['source-1'],
        primarySourceCandidateIds: [],
        unresolvedQuestions: [],
        completionSuggestion: 'coverage-sufficient',
      },
      modelCalls: 1,
      toolCalls: 0,
    });

    expect(input.toolCallingModel.invoke).not.toHaveBeenCalled();
    expect(input.structuredOutputModel.invoke).toHaveBeenCalledTimes(1);
  });

  it('preserves one model call for final selection after repeated tool use', async () => {
    const input = baseInput();

    vi.mocked(input.toolCallingModel.invoke)
      .mockResolvedValueOnce(
        new AIMessage({
          content: '',
          tool_calls: [
            {
              id: 'call-1',
              name: 'fetch_article',
              args: {
                sourceId: 'source-1',
              },
              type: 'tool_call',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        new AIMessage({
          content: '',
          tool_calls: [
            {
              id: 'call-2',
              name: 'fetch_article',
              args: {
                sourceId: 'source-1',
              },
              type: 'tool_call',
            },
          ],
        }),
      );

    vi.mocked(input.toolPorts.fetchArticle).mockResolvedValue({
      status: 'ok',
      sourceId: 'source-1',
      text: 'Research evidence.',
      fetchedAt: '2026-10-05T22:00:00.000Z',
      truncated: false,
    });

    vi.mocked(input.structuredOutputModel.invoke).mockResolvedValue({
      sourceIds: ['source-1'],
      primarySourceCandidateIds: [],
      unresolvedQuestions: [],
      completionSuggestion: 'coverage-sufficient',
    });

    const result = await runResearchAgent(input);

    expect(result).toMatchObject({
      status: 'selected',
      modelCalls: 3,
      toolCalls: 2,
    });

    expect(input.toolCallingModel.invoke).toHaveBeenCalledTimes(2);
    expect(input.structuredOutputModel.invoke).toHaveBeenCalledTimes(1);
  });

  it('stops before executing a tool beyond tool budget', async () => {
    const input: ResearchRunnerInput = {
      ...baseInput(),
      budget: {
        ...budget,
        maxToolCalls: 0,
      },
    };

    vi.mocked(input.toolCallingModel.invoke).mockResolvedValue(
      new AIMessage({
        content: '',
        tool_calls: [
          {
            type: 'tool_call',
            id: 'call-1',
            name: 'fetch_article',
            args: {
              sourceId: 'source-1',
            },
          },
        ],
      }),
    );

    const result = await runResearchAgent(input);

    expect(result).toEqual({
      status: 'stopped',
      reason: 'tool-budget-exhausted',
      modelCalls: 1,
      toolCalls: 0,
    });

    expect(input.toolPorts.fetchArticle).not.toHaveBeenCalled();
  });

  it('rejects final model references not present in latest catalog', async () => {
    const input = baseInput();

    vi.mocked(input.toolCallingModel.invoke).mockResolvedValue(
      new AIMessage({
        content: 'Finalize',
        tool_calls: [],
      }),
    );

    vi.mocked(input.structuredOutputModel.invoke).mockResolvedValue({
      sourceIds: ['invented-source'],
      primarySourceCandidateIds: [],
      unresolvedQuestions: [],
      completionSuggestion: 'coverage-sufficient',
    });

    await expect(runResearchAgent(input)).rejects.toThrow(
      'Selected source must exist in the source catalog.',
    );
  });
});
