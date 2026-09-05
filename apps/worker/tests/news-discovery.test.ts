import { createMetricsRegistry, createNewsDiscoveryMetrics } from '@genai-news/observability';

import type {
  NewsSource,
  NewsSourceResult,
  NormalizedArticle,
  StoryArticleId,
} from '@genai-news/shared';

import { describe, expect, it, vi } from 'vitest';

import { processNewsDiscovery } from '../src/jobs/news-discovery.js';

import type { NewsSourceRegistry } from '../src/news/source-registry.js';

const now = new Date('2026-08-27T16:00:00.000Z');

function createSourceResult(): NewsSourceResult {
  return {
    source: {
      id: 'gnews',
      name: 'GNews',
      type: 'api',
    },

    fetchedAt: new Date('2026-08-27T15:59:00.000Z'),

    articles: [
      {
        externalId: '1',

        title: 'Fresh article',

        url: 'https://example.com/fresh',

        publishedAt: '2026-08-27T15:00:00.000Z',

        publisher: {
          name: 'Publisher A',
        },
      },

      {
        externalId: '2',

        title: 'Old article',

        url: 'https://example.com/old',

        publishedAt: '2026-08-20T15:00:00.000Z',

        publisher: {
          name: 'Publisher A',
        },
      },

      {
        externalId: '3',

        title: '   ',

        url: 'https://example.com/invalid',

        publishedAt: '2026-08-27T15:00:00.000Z',
      },

      {
        externalId: '4',

        title: 'Fresh article',

        url: 'https://example.com/duplicate',

        publishedAt: '2026-08-27T15:00:00.000Z',

        publisher: {
          name: 'Publisher A',
        },
      },
    ],
  };
}

function createRegistry(result: NewsSourceResult): NewsSourceRegistry {
  const source: NewsSource = {
    id: 'gnews',
    name: 'GNews',
    type: 'api',

    fetchLatest: vi.fn(async () => result),
  };

  return {
    get(sourceId: string) {
      if (sourceId !== 'gnews') {
        throw new Error(`Unsupported news source: ${sourceId}`);
      }

      return source;
    },
  };
}

function createStoryClusterer() {
  return {
    clusterArticle: vi.fn(async (articleId: StoryArticleId) => ({
      kind: 'seeded-new-story' as const,

      articleId,

      storyId: 'story-test',
    })),
  };
}

function createPersistedArticle(
  article: NormalizedArticle,

  id: string,
) {
  return {
    id,

    title: article.title,

    url: article.url,

    canonicalUrl: article.canonicalUrl,

    sourceId: article.source.id,

    sourceName: article.source.name,

    sourceType: article.source.type,

    publisherId: article.publisher?.id ?? null,

    publisherName: article.publisher?.name ?? null,

    externalId: article.externalId,

    publishedAt: article.publishedAt,

    firstDiscoveredAt: article.discoveredAt,

    lastSeenAt: article.discoveredAt,

    author: article.author,

    summary: article.summary,

    category: article.category,

    metadata: article.metadata,

    createdAt: now,

    updatedAt: now,
  };
}

describe('processNewsDiscovery', () => {
  it('records discovery stage metrics', async () => {
    const result = createSourceResult();

    const registry = createMetricsRegistry({
      service: 'worker',

      environment: 'test',

      collectDefaults: false,
    });

    const metrics = createNewsDiscoveryMetrics(registry);

    await processNewsDiscovery(
      {
        sourceId: 'gnews',

        limit: 10,

        requestedAt: '2026-08-27T15:58:00.000Z',
      },

      {
        sourceRegistry: createRegistry(result),

        articleRepository: {
          async persist(article) {
            return createPersistedArticle(article, 'persisted-1');
          },

          async findByCanonicalUrl() {
            return null;
          },
        },

        storyClusterer: createStoryClusterer(),

        freshnessPolicy: {
          maxAgeMs: 24 * 60 * 60 * 1000,

          maxFutureSkewMs: 5 * 60 * 1000,

          missingPublishedAt: 'reject',
        },

        metrics,

        now: () => now,
      },
    );

    const output = await registry.metrics();

    expect(output).toContain('genai_news_articles_fetched_total');

    expect(output).toContain('genai_news_articles_normalized_total');

    expect(output).toContain('genai_news_articles_normalization_rejected_total');

    expect(output).toContain('genai_news_articles_fresh_total');

    expect(output).toContain('genai_news_articles_freshness_rejected_total');

    expect(output).toContain('genai_news_articles_unique_total');

    expect(output).toContain('genai_news_articles_duplicates_total');

    expect(output).toContain('genai_news_articles_persisted_total');

    expect(output).toContain('genai_news_source_fetch_duration_seconds');

    expect(output).toContain('genai_news_persistence_duration_seconds');

    expect(output).toContain('source_id="gnews"');
  });

  it('runs fetch, normalization, freshness, deduplication, persistence, and clustering', async () => {
    const result = createSourceResult();

    const persisted: NormalizedArticle[] = [];

    const storyClusterer = createStoryClusterer();

    const output = await processNewsDiscovery(
      {
        sourceId: 'gnews',

        limit: 10,

        requestedAt: '2026-08-27T15:58:00.000Z',
      },

      {
        sourceRegistry: createRegistry(result),

        articleRepository: {
          async persist(article) {
            persisted.push(article);

            return createPersistedArticle(article, `persisted-${persisted.length}`);
          },

          async findByCanonicalUrl() {
            return null;
          },
        },

        storyClusterer,

        freshnessPolicy: {
          maxAgeMs: 24 * 60 * 60 * 1000,

          maxFutureSkewMs: 5 * 60 * 1000,

          missingPublishedAt: 'reject',
        },

        now: () => now,
      },
    );

    expect(output).toEqual({
      sourceId: 'gnews',

      fetchedCount: 4,

      normalizedCount: 3,

      normalizationRejectedCount: 1,

      freshCount: 2,

      freshnessRejectedCount: 1,

      uniqueCount: 1,

      duplicateCount: 1,

      persistedCount: 1,

      clusteredCount: 1,

      alreadyAssignedCount: 0,

      assignedExistingStoryCount: 0,

      seededNewStoryCount: 1,

      requestedAt: '2026-08-27T15:58:00.000Z',

      completedAt: '2026-08-27T16:00:00.000Z',
    });

    expect(persisted).toHaveLength(1);

    expect(persisted[0]?.title).toBe('Fresh article');

    expect(storyClusterer.clusterArticle).toHaveBeenCalledTimes(1);

    expect(storyClusterer.clusterArticle).toHaveBeenCalledWith('persisted-1');
  });

  it('rejects an unsupported source', async () => {
    await expect(
      processNewsDiscovery(
        {
          sourceId: 'unknown',

          limit: 10,

          requestedAt: '2026-08-27T15:58:00.000Z',
        },

        {
          sourceRegistry: createRegistry(createSourceResult()),

          articleRepository: {
            persist: vi.fn(),

            findByCanonicalUrl: vi.fn(),
          },

          storyClusterer: createStoryClusterer(),

          freshnessPolicy: {
            maxAgeMs: 24 * 60 * 60 * 1000,

            maxFutureSkewMs: 5 * 60 * 1000,

            missingPublishedAt: 'reject',
          },

          now: () => now,
        },
      ),
    ).rejects.toThrow('Unsupported news source: unknown');
  });

  it('rejects an invalid discovery payload', async () => {
    await expect(
      processNewsDiscovery(
        {
          sourceId: '',

          limit: 0,

          requestedAt: 'invalid',
        },

        {
          sourceRegistry: createRegistry(createSourceResult()),

          articleRepository: {
            persist: vi.fn(),

            findByCanonicalUrl: vi.fn(),
          },

          storyClusterer: createStoryClusterer(),

          freshnessPolicy: {
            maxAgeMs: 24 * 60 * 60 * 1000,

            maxFutureSkewMs: 5 * 60 * 1000,

            missingPublishedAt: 'reject',
          },

          now: () => now,
        },
      ),
    ).rejects.toThrow();
  });

  it('does not persist or cluster stale articles', async () => {
    const persist = vi.fn();

    const storyClusterer = createStoryClusterer();

    await processNewsDiscovery(
      {
        sourceId: 'gnews',

        limit: 10,

        requestedAt: '2026-08-27T15:58:00.000Z',
      },

      {
        sourceRegistry: createRegistry({
          source: {
            id: 'gnews',

            name: 'GNews',

            type: 'api',
          },

          fetchedAt: new Date('2026-08-27T15:59:00.000Z'),

          articles: [
            {
              title: 'Old article',

              url: 'https://example.com/old',

              publishedAt: '2026-08-20T15:00:00.000Z',
            },
          ],
        }),

        articleRepository: {
          persist,

          findByCanonicalUrl: vi.fn(),
        },

        storyClusterer,

        freshnessPolicy: {
          maxAgeMs: 24 * 60 * 60 * 1000,

          maxFutureSkewMs: 5 * 60 * 1000,

          missingPublishedAt: 'reject',
        },

        now: () => now,
      },
    );

    expect(persist).not.toHaveBeenCalled();

    expect(storyClusterer.clusterArticle).not.toHaveBeenCalled();
  });

  it('clusters only after article persistence succeeds', async () => {
    const storyClusterer = createStoryClusterer();

    const persist = vi.fn(async () => {
      throw new Error('database unavailable');
    });

    await expect(
      processNewsDiscovery(
        {
          sourceId: 'gnews',

          limit: 10,

          requestedAt: '2026-08-27T15:58:00.000Z',
        },

        {
          sourceRegistry: createRegistry({
            source: {
              id: 'gnews',

              name: 'GNews',

              type: 'api',
            },

            fetchedAt: new Date('2026-08-27T15:59:00.000Z'),

            articles: [
              {
                title: 'Fresh article',

                url: 'https://example.com/fresh',

                publishedAt: '2026-08-27T15:00:00.000Z',
              },
            ],
          }),

          articleRepository: {
            persist,

            findByCanonicalUrl: vi.fn(),
          },

          storyClusterer,

          freshnessPolicy: {
            maxAgeMs: 24 * 60 * 60 * 1000,

            maxFutureSkewMs: 5 * 60 * 1000,

            missingPublishedAt: 'reject',
          },

          now: () => now,
        },
      ),
    ).rejects.toThrow('database unavailable');

    expect(storyClusterer.clusterArticle).not.toHaveBeenCalled();
  });

  it('fails discovery when story clustering fails after persistence', async () => {
    const storyClusterer = {
      clusterArticle: vi.fn(async () => {
        throw new Error('semantic provider unavailable');
      }),
    };

    await expect(
      processNewsDiscovery(
        {
          sourceId: 'gnews',

          limit: 10,

          requestedAt: '2026-08-27T15:58:00.000Z',
        },

        {
          sourceRegistry: createRegistry(createSourceResult()),

          articleRepository: {
            async persist(article) {
              return createPersistedArticle(article, 'persisted-1');
            },

            findByCanonicalUrl: vi.fn(),
          },

          storyClusterer,

          freshnessPolicy: {
            maxAgeMs: 24 * 60 * 60 * 1000,

            maxFutureSkewMs: 5 * 60 * 1000,

            missingPublishedAt: 'reject',
          },

          now: () => now,
        },
      ),
    ).rejects.toThrow('semantic provider unavailable');

    expect(storyClusterer.clusterArticle).toHaveBeenCalledWith('persisted-1');
  });

  it('counts already-assigned clustering results separately', async () => {
    const storyClusterer = {
      clusterArticle: vi.fn(async (articleId: StoryArticleId) => ({
        kind: 'already-assigned' as const,

        articleId,

        storyId: 'story-existing',
      })),
    };

    const result = await processNewsDiscovery(
      {
        sourceId: 'gnews',

        limit: 10,

        requestedAt: '2026-08-27T15:58:00.000Z',
      },

      {
        sourceRegistry: createRegistry(createSourceResult()),

        articleRepository: {
          async persist(article) {
            return createPersistedArticle(article, 'persisted-1');
          },

          findByCanonicalUrl: vi.fn(),
        },

        storyClusterer,

        freshnessPolicy: {
          maxAgeMs: 24 * 60 * 60 * 1000,

          maxFutureSkewMs: 5 * 60 * 1000,

          missingPublishedAt: 'reject',
        },

        now: () => now,
      },
    );

    expect(result.clusteredCount).toBe(1);

    expect(result.alreadyAssignedCount).toBe(1);

    expect(result.assignedExistingStoryCount).toBe(0);

    expect(result.seededNewStoryCount).toBe(0);
  });
});
