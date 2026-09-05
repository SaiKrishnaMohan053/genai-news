import {
  createArticleRepository,
  createPrismaClient,
  createStoryRepository,
  type DatabaseClient,
} from '@genai-news/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for API integration tests');
}

const testUrlPrefix = 'https://story-api.example.com/';

describe('news story API integration', () => {
  let database: DatabaseClient;

  beforeAll(() => {
    database = createPrismaClient(databaseUrl);
  });

  beforeEach(async () => {
    await cleanupTestData(database);
  });

  afterAll(async () => {
    await cleanupTestData(database);

    await database.$disconnect();
  });

  it('returns recent stories newest first with membership counts', async () => {
    const articleRepository = createArticleRepository(database);
    const storyRepository = createStoryRepository(database);

    const olderSeed = await articleRepository.persist(
      createArticle({
        title: 'Older story seed',
        canonicalUrl: `${testUrlPrefix}older-seed`,
        url: `${testUrlPrefix}older-seed`,
        externalId: 'older-seed',
        publishedAt: new Date('2026-09-05T10:00:00.000Z'),
      }),
    );

    const olderMatched = await articleRepository.persist(
      createArticle({
        title: 'Older story matched article',
        canonicalUrl: `${testUrlPrefix}older-matched`,
        url: `${testUrlPrefix}older-matched`,
        externalId: 'older-matched',
        publishedAt: new Date('2026-09-05T11:00:00.000Z'),
      }),
    );

    const newerSeed = await articleRepository.persist(
      createArticle({
        title: 'Newer story seed',
        canonicalUrl: `${testUrlPrefix}newer-seed`,
        url: `${testUrlPrefix}newer-seed`,
        externalId: 'newer-seed',
        publishedAt: new Date('2026-09-05T12:00:00.000Z'),
      }),
    );

    await storyRepository.createSeedStory(
      createSeedStoryInput({
        storyId: 'story-api-older',
        seedArticleId: olderSeed.id,
        canonicalTitle: 'Older story seed',
      }),
    );

    await storyRepository.addMatchedMembership(
      createMatchedMembershipInput({
        storyId: 'story-api-older',
        articleId: olderMatched.id,
        representativeArticleId: olderSeed.id,
      }),
    );

    await storyRepository.createSeedStory(
      createSeedStoryInput({
        storyId: 'story-api-newer',
        seedArticleId: newerSeed.id,
        canonicalTitle: 'Newer story seed',
      }),
    );

    const app = buildApp({
      logger: false,
      database,
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/news/stories?limit=10',
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{
        stories: Array<{
          id: string;
          canonicalTitle: string;
          seedArticleId: string;
          representativeArticleId: string;
          clusteringVersion: string;
          firstPublishedAt: string | null;
          lastPublishedAt: string | null;
          membershipCount: number;
          createdAt: string;
          updatedAt: string;
        }>;
      }>();

      expect(body.stories).toHaveLength(2);

      expect(body.stories.map((story) => story.id)).toEqual(['story-api-newer', 'story-api-older']);

      expect(body.stories[0]).toMatchObject({
        id: 'story-api-newer',
        canonicalTitle: 'Newer story seed',
        seedArticleId: newerSeed.id,
        representativeArticleId: newerSeed.id,
        clusteringVersion: 'story-clustering-v1',
        firstPublishedAt: '2026-09-05T12:00:00.000Z',
        lastPublishedAt: '2026-09-05T12:00:00.000Z',
        membershipCount: 1,
      });

      expect(body.stories[1]).toMatchObject({
        id: 'story-api-older',
        canonicalTitle: 'Older story seed',
        seedArticleId: olderSeed.id,
        representativeArticleId: olderSeed.id,
        clusteringVersion: 'story-clustering-v1',
        firstPublishedAt: '2026-09-05T10:00:00.000Z',
        lastPublishedAt: '2026-09-05T11:00:00.000Z',
        membershipCount: 2,
      });
    } finally {
      await app.close();
    }
  });

  it('returns story detail with seed and matched memberships', async () => {
    const articleRepository = createArticleRepository(database);
    const storyRepository = createStoryRepository(database);

    const seed = await articleRepository.persist(
      createArticle({
        title: 'Acme launches new AI platform',
        canonicalUrl: `${testUrlPrefix}detail-seed`,
        url: `${testUrlPrefix}detail-seed`,
        externalId: 'detail-seed',
        publishedAt: new Date('2026-09-05T09:00:00.000Z'),
        publisherName: 'Seed Publisher',
      }),
    );

    const matched = await articleRepository.persist(
      createArticle({
        title: 'Acme unveils its new AI platform',
        canonicalUrl: `${testUrlPrefix}detail-matched`,
        url: `${testUrlPrefix}detail-matched`,
        externalId: 'detail-matched',
        publishedAt: new Date('2026-09-05T09:15:00.000Z'),
        publisherName: 'Matched Publisher',
      }),
    );

    await storyRepository.createSeedStory(
      createSeedStoryInput({
        storyId: 'story-api-detail',
        seedArticleId: seed.id,
        canonicalTitle: 'Acme launches new AI platform',
      }),
    );

    await storyRepository.addMatchedMembership(
      createMatchedMembershipInput({
        storyId: 'story-api-detail',
        articleId: matched.id,
        representativeArticleId: seed.id,
        score: 0.91,
      }),
    );

    const app = buildApp({
      logger: false,
      database,
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/news/stories/story-api-detail',
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{
        story: {
          id: string;
          canonicalTitle: string;
          seedArticleId: string;
          representativeArticleId: string;
          clusteringVersion: string;
          firstPublishedAt: string | null;
          lastPublishedAt: string | null;
          memberships: Array<{
            id: string;
            kind: 'SEED' | 'MATCHED';
            score: number | null;
            signals: unknown;
            reason: string | null;
            matchedAgainstArticleId: string | null;
            clusteringVersion: string;
            createdAt: string;
            article: {
              id: string;
              title: string;
              url: string;
              canonicalUrl: string;
              source: {
                id: string;
                name: string;
                type: string;
              };
              publisher: {
                id: string | null;
                name: string;
              } | null;
              publishedAt: string | null;
              firstDiscoveredAt: string;
              lastSeenAt: string;
            };
          }>;
        };
      }>();

      expect(body.story).toMatchObject({
        id: 'story-api-detail',
        canonicalTitle: 'Acme launches new AI platform',
        seedArticleId: seed.id,
        representativeArticleId: seed.id,
        clusteringVersion: 'story-clustering-v1',
        firstPublishedAt: '2026-09-05T09:00:00.000Z',
        lastPublishedAt: '2026-09-05T09:15:00.000Z',
      });

      expect(body.story.memberships).toHaveLength(2);

      expect(body.story.memberships[0]).toMatchObject({
        kind: 'SEED',
        score: null,
        reason: null,
        matchedAgainstArticleId: null,
        clusteringVersion: 'story-clustering-v1',

        article: {
          id: seed.id,
          title: 'Acme launches new AI platform',
          canonicalUrl: `${testUrlPrefix}detail-seed`,

          source: {
            id: 'gnews',
            name: 'GNews',
            type: 'api',
          },

          publisher: {
            id: null,
            name: 'Seed Publisher',
          },

          publishedAt: '2026-09-05T09:00:00.000Z',
        },
      });

      expect(body.story.memberships[1]).toMatchObject({
        kind: 'MATCHED',
        score: 0.91,
        signals: {
          semanticSimilarity: 0.91,
        },
        reason: 'semantic-similarity-at-or-above-v1-threshold',
        matchedAgainstArticleId: seed.id,
        clusteringVersion: 'story-clustering-v1',

        article: {
          id: matched.id,
          title: 'Acme unveils its new AI platform',
          canonicalUrl: `${testUrlPrefix}detail-matched`,

          source: {
            id: 'gnews',
            name: 'GNews',
            type: 'api',
          },

          publisher: {
            id: null,
            name: 'Matched Publisher',
          },

          publishedAt: '2026-09-05T09:15:00.000Z',
        },
      });
    } finally {
      await app.close();
    }
  });

  it('returns not found for a missing story', async () => {
    const app = buildApp({
      logger: false,
      database,
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/news/stories/story-does-not-exist',
      });

      expect(response.statusCode).toBe(404);

      expect(response.json()).toEqual({
        error: {
          code: 'STORY_NOT_FOUND',
          message: 'Story not found',
        },
      });
    } finally {
      await app.close();
    }
  });

  it('rejects an invalid story list limit', async () => {
    const app = buildApp({
      logger: false,
      database,
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/news/stories?limit=0',
      });

      expect(response.statusCode).toBe(400);

      expect(response.json()).toEqual({
        error: {
          code: 'INVALID_STORY_LIST_REQUEST',
          message: 'Invalid story list request',
        },
      });
    } finally {
      await app.close();
    }
  });
});

function createArticle(
  overrides: {
    title?: string;
    canonicalUrl?: string;
    url?: string;
    externalId?: string;
    publishedAt?: Date | null;
    publisherName?: string | null;
  } = {},
) {
  return {
    title: overrides.title ?? 'Story API article',

    url: overrides.url ?? `${testUrlPrefix}article`,
    canonicalUrl: overrides.canonicalUrl ?? `${testUrlPrefix}article`,

    source: {
      id: 'gnews',
      name: 'GNews',
      type: 'api' as const,
    },

    publisher:
      overrides.publisherName === null
        ? null
        : {
            name: overrides.publisherName ?? 'Story API Publisher',
          },

    externalId: overrides.externalId ?? 'story-api-article',

    publishedAt:
      overrides.publishedAt === undefined
        ? new Date('2026-09-05T09:00:00.000Z')
        : overrides.publishedAt,

    discoveredAt: new Date('2026-09-05T09:01:00.000Z'),

    author: null,
    summary: null,
    category: null,
    metadata: null,
  };
}

function createSeedStoryInput(input: {
  storyId: string;
  seedArticleId: string;
  canonicalTitle: string;
}) {
  return {
    storyId: input.storyId,
    seedArticleId: input.seedArticleId,
    canonicalTitle: input.canonicalTitle,
    clusteringVersion: 'story-clustering-v1',
  } as Parameters<ReturnType<typeof createStoryRepository>['createSeedStory']>[0];
}

function createMatchedMembershipInput(input: {
  storyId: string;
  articleId: string;
  representativeArticleId: string;
  score?: number;
}) {
  const score = input.score ?? 0.91;

  return {
    storyId: input.storyId,

    articleId: input.articleId,

    representativeArticleId: input.representativeArticleId,

    matchDecision: {
      decision: 'match',

      score,

      signals: {
        semanticSimilarity: score,
      },

      reason: 'semantic-similarity-at-or-above-v1-threshold',

      clusteringVersion: 'story-clustering-v1',
    },
  } as Parameters<ReturnType<typeof createStoryRepository>['addMatchedMembership']>[0];
}

async function cleanupTestData(database: DatabaseClient): Promise<void> {
  await database.storyMembership.deleteMany({
    where: {
      article: {
        canonicalUrl: {
          startsWith: testUrlPrefix,
        },
      },
    },
  });

  await database.story.deleteMany({
    where: {
      seedArticle: {
        canonicalUrl: {
          startsWith: testUrlPrefix,
        },
      },
    },
  });

  await database.article.deleteMany({
    where: {
      canonicalUrl: {
        startsWith: testUrlPrefix,
      },
    },
  });
}
