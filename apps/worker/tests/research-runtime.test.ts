import type { ResearchStructuredOutputModel, ResearchToolCallingModel } from '@genai-news/agents';

import type { StoryDetail, StoryRepository } from '@genai-news/database';

import type { ResearchSearchProvider } from '@genai-news/tools';

import type { ResearchBudget } from '@genai-news/shared';

import { describe, expect, it, vi } from 'vitest';

import type { ResearchExecutionInput } from '../src/jobs/research.js';

import {
  createResearchRuntimeFactory,
  type ResearchRuntimeModelFactory,
} from '../src/research/research-runtime.js';

const budget: ResearchBudget = {
  maxToolCalls: 6,
  maxModelCalls: 4,
  timeoutMs: 30_000,
  maxSelectedSources: 5,
  maxUnresolvedQuestions: 3,
  maxQuestionLength: 300,
};

const executionInput: ResearchExecutionInput = {
  researchRunId: 'research-run-1',
  storyId: 'story-1',
  researchGoal: 'Find stronger source coverage.',
  budget,
};

function createStory(): StoryDetail {
  return {
    id: 'story-1',

    canonicalTitle: 'Example research story',

    seedArticleId: 'article-1',
    representativeArticleId: 'article-1',

    clusteringVersion: 'story-clustering-v1',

    firstPublishedAt: new Date('2026-09-29T12:00:00.000Z'),
    lastPublishedAt: new Date('2026-09-29T13:00:00.000Z'),

    createdAt: new Date('2026-09-29T12:05:00.000Z'),
    updatedAt: new Date('2026-09-29T13:05:00.000Z'),

    memberships: [
      {
        id: 'membership-1',

        kind: 'SEED',

        score: null,
        signals: null,
        reason: null,

        matchedAgainstArticleId: null,

        clusteringVersion: 'story-clustering-v1',

        createdAt: new Date('2026-09-29T12:05:00.000Z'),

        article: {
          id: 'article-1',

          title: 'Original story source',

          url: 'https://example.com/original',
          canonicalUrl: 'https://example.com/original',

          sourceId: 'gnews',
          sourceName: 'GNews',
          sourceType: 'api',

          publisherId: 'publisher-1',
          publisherName: 'Example Publisher',

          publishedAt: new Date('2026-09-29T12:00:00.000Z'),

          firstDiscoveredAt: new Date('2026-09-29T12:01:00.000Z'),
          lastSeenAt: new Date('2026-09-29T12:02:00.000Z'),
        },
      },
      {
        id: 'membership-2',

        kind: 'MATCHED',

        score: 0.9,
        signals: {},
        reason: 'matched',

        matchedAgainstArticleId: 'article-1',

        clusteringVersion: 'story-clustering-v1',

        createdAt: new Date('2026-09-29T13:05:00.000Z'),

        article: {
          id: 'article-2',

          title: 'Related story source',

          url: 'https://example.org/related',
          canonicalUrl: 'https://example.org/related',

          sourceId: 'rss',
          sourceName: 'RSS',
          sourceType: 'rss',

          publisherId: null,
          publisherName: 'Related Publisher',

          publishedAt: new Date('2026-09-29T13:00:00.000Z'),

          firstDiscoveredAt: new Date('2026-09-29T13:01:00.000Z'),
          lastSeenAt: new Date('2026-09-29T13:02:00.000Z'),
        },
      },
    ],
  };
}

function createStoryRepository(story: StoryDetail | null = createStory()): StoryRepository {
  return {
    createSeedStory: vi.fn(),
    addMatchedMembership: vi.fn(),
    findById: vi.fn(),
    findMembershipByArticleId: vi.fn(),
    listRecent: vi.fn(),
    findDetailById: vi.fn(async () => story),
  };
}

function createModels() {
  const toolCallingModel = {
    invoke: vi.fn(),
  } as unknown as ResearchToolCallingModel;

  const structuredOutputModel = {
    invoke: vi.fn(),
  } as unknown as ResearchStructuredOutputModel;

  const models: ResearchRuntimeModelFactory = {
    createToolCallingModel: vi.fn(() => toolCallingModel),

    createStructuredOutputModel: vi.fn(() => structuredOutputModel),
  };

  return {
    models,
    toolCallingModel,
    structuredOutputModel,
  };
}

function createSearchProvider(): ResearchSearchProvider {
  return vi.fn(async () => ({
    articles: [
      {
        externalId: 'provider-1',

        title: 'Official announcement',

        url: 'https://official.example.com/announcement',

        publishedAt: '2026-09-29T14:00:00.000Z',

        summary: 'Official announcement summary.',

        publisher: {
          id: 'official',
          name: 'Official Publisher',
        },
      },
    ],

    truncated: false,
  })) as unknown as ResearchSearchProvider;
}

describe('research runtime factory', () => {
  it('registers news-search results into the application-owned catalog', async () => {
    const { models } = createModels();

    const runtime = await createResearchRuntimeFactory({
      storyRepository: createStoryRepository(),

      searchProvider: createSearchProvider(),

      models,

      now: () => new Date('2026-09-29T18:00:00.000Z'),
    })(executionInput);

    const result = await runtime.toolPorts.searchNews(
      {
        query: 'AI announcement',
      },

      {
        researchRunId: 'research-run-1',

        storyId: 'story-1',

        toolCallId: 'call-news-1',

        toolName: 'search_news',
      },
    );

    expect(result).toMatchObject({
      status: 'ok',

      sources: [
        {
          sourceId: 'tool_call-news-1_0',

          title: 'Official announcement',
        },
      ],
    });

    expect(runtime.getCatalog().sources).toContainEqual(
      expect.objectContaining({
        sourceId: 'tool_call-news-1_0',

        canonicalUrl: 'https://official.example.com/announcement',

        provenance: [
          {
            kind: 'tool-result',

            toolCallId: 'call-news-1',

            toolName: 'search_news',
          },
        ],
      }),
    );
  });

  it('builds research context and initial catalog from persisted story detail', async () => {
    const storyRepository = createStoryRepository();

    const { models } = createModels();

    const runtime = await createResearchRuntimeFactory({
      storyRepository,

      searchProvider: createSearchProvider(),

      models,

      now: () => new Date('2026-09-29T18:00:00.000Z'),
    })(executionInput);

    expect(storyRepository.findDetailById).toHaveBeenCalledWith('story-1');

    expect(runtime.context).toEqual({
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

      existingArticleIds: ['article-1', 'article-2'],
    });

    expect(runtime.getCatalog()).toEqual({
      researchRunId: 'research-run-1',

      storyId: 'story-1',

      sources: [
        {
          sourceId: 'story_article-1',

          url: 'https://example.com/original',

          canonicalUrl: 'https://example.com/original',

          title: 'Original story source',

          publisherName: 'Example Publisher',

          publishedAt: new Date('2026-09-29T12:00:00.000Z'),

          observedAt: new Date('2026-09-29T18:00:00.000Z'),

          provenance: [
            {
              kind: 'story-member',

              articleId: 'article-1',
            },
          ],
        },
        {
          sourceId: 'story_article-2',

          url: 'https://example.org/related',

          canonicalUrl: 'https://example.org/related',

          title: 'Related story source',

          publisherName: 'Related Publisher',

          publishedAt: new Date('2026-09-29T13:00:00.000Z'),

          observedAt: new Date('2026-09-29T18:00:00.000Z'),

          provenance: [
            {
              kind: 'story-member',

              articleId: 'article-2',
            },
          ],
        },
      ],
    });
  });

  it('registers official-search results into the application-owned catalog', async () => {
    const { models } = createModels();

    const runtime = await createResearchRuntimeFactory({
      storyRepository: createStoryRepository(),

      searchProvider: createSearchProvider(),

      models,

      now: () => new Date('2026-09-29T18:00:00.000Z'),
    })(executionInput);

    const result = await runtime.toolPorts.searchOfficialSource(
      {
        query: 'official announcement',
      },
      {
        researchRunId: 'research-run-1',

        storyId: 'story-1',

        toolCallId: 'call-official-1',

        toolName: 'search_official_source',
      },
    );

    expect(result).toMatchObject({
      status: 'ok',

      sources: [
        {
          sourceId: 'tool_call-official-1_0',

          title: 'Official announcement',

          publisherName: 'Official Publisher',

          publishedAt: '2026-09-29T14:00:00.000Z',
        },
      ],
    });

    expect(runtime.getCatalog().sources).toContainEqual(
      expect.objectContaining({
        sourceId: 'tool_call-official-1_0',

        url: 'https://official.example.com/announcement',

        canonicalUrl: 'https://official.example.com/announcement',

        provenance: [
          {
            kind: 'tool-result',

            toolCallId: 'call-official-1',

            toolName: 'search_official_source',
          },
        ],
      }),
    );

    expect(runtime.toolPorts.hasSource('tool_call-official-1_0')).toBe(true);
  });

  it('excludes already-known canonical URLs from related-source search', async () => {
    const { models } = createModels();

    const searchProvider = vi.fn(async () => ({
      articles: [
        {
          externalId: 'known',

          title: 'Known article',

          url: 'https://example.com/original',

          publishedAt: '2026-09-29T12:00:00.000Z',

          publisher: {
            id: 'known',
            name: 'Known Publisher',
          },
        },
        {
          externalId: 'new',

          title: 'New related article',

          url: 'https://new.example.com/related',

          publishedAt: '2026-09-29T15:00:00.000Z',

          publisher: {
            id: 'new',
            name: 'New Publisher',
          },
        },
      ],

      truncated: false,
    })) as unknown as ResearchSearchProvider;

    const runtime = await createResearchRuntimeFactory({
      storyRepository: createStoryRepository(),

      searchProvider,

      models,

      now: () => new Date('2026-09-29T18:00:00.000Z'),
    })(executionInput);

    const result = await runtime.toolPorts.findRelatedSources(
      {
        query: 'additional coverage',
      },
      {
        researchRunId: 'research-run-1',

        storyId: 'story-1',

        toolCallId: 'call-related-1',

        toolName: 'find_related_sources',
      },
    );

    expect(result).toMatchObject({
      status: 'ok',

      rejectedCount: 1,

      sources: [
        {
          sourceId: 'tool_call-related-1_0',

          title: 'New related article',
        },
      ],
    });

    const catalog = runtime.getCatalog();

    expect(
      catalog.sources.filter((source) => source.canonicalUrl === 'https://example.com/original'),
    ).toHaveLength(1);

    expect(
      catalog.sources.some((source) => source.canonicalUrl === 'https://new.example.com/related'),
    ).toBe(true);
  });

  it('binds both research models to the runtime', async () => {
    const { models, toolCallingModel, structuredOutputModel } = createModels();

    const runtime = await createResearchRuntimeFactory({
      storyRepository: createStoryRepository(),

      searchProvider: createSearchProvider(),

      models,

      now: () => new Date('2026-09-29T18:00:00.000Z'),
    })(executionInput);

    expect(models.createToolCallingModel).toHaveBeenCalledTimes(1);

    expect(models.createStructuredOutputModel).toHaveBeenCalledTimes(1);

    expect(runtime.toolCallingModel).toBe(toolCallingModel);

    expect(runtime.structuredOutputModel).toBe(structuredOutputModel);
  });

  it('rejects a missing persisted story', async () => {
    const { models } = createModels();

    const createRuntime = createResearchRuntimeFactory({
      storyRepository: createStoryRepository(null),

      searchProvider: createSearchProvider(),

      models,
    });

    await expect(createRuntime(executionInput)).rejects.toThrow(
      'Cannot create research runtime for missing story: story-1',
    );
  });

  it('rejects a story with no memberships', async () => {
    const { models } = createModels();

    const story = {
      ...createStory(),

      memberships: [],
    };

    const createRuntime = createResearchRuntimeFactory({
      storyRepository: createStoryRepository(story),

      searchProvider: createSearchProvider(),

      models,
    });

    await expect(createRuntime(executionInput)).rejects.toThrow(
      'Research story has no article memberships: story-1',
    );
  });
});
