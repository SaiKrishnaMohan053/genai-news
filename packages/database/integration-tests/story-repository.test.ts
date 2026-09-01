import {
  createArticleRepository,
  createPrismaClient,
  createStoryRepository,
  StoryPersistenceConflictError,
  type DatabaseClient,
} from '../src/index.js';

import {
  decideStoryMatchV1,
  INITIAL_STORY_CLUSTERING_VERSION,
  type NormalizedArticle,
  type StoryArticleId,
  type StoryId,
} from '@genai-news/shared';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for database integration tests');
}

const testUrlPrefix = 'https://story-repository.integration.example.com/';

let database: DatabaseClient;

function storyId(value: string): StoryId {
  return value as StoryId;
}

function articleId(value: string): StoryArticleId {
  return value as StoryArticleId;
}

describe('story repository integration', () => {
  beforeEach(async () => {
    database = database ?? createPrismaClient(databaseUrl);

    /**
     * Memberships and stories reference articles
     * with RESTRICT, so delete in dependency order.
     */
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
  });

  afterAll(async () => {
    if (database) {
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

      await database.$disconnect();
    }
  });

  it('creates a story and seed membership atomically', async () => {
    const seed = await persistArticle(
      'seed-a',
      'Seed article',
      new Date('2026-09-01T10:00:00.000Z'),
    );

    const repository = createStoryRepository(database);

    const result = await repository.createSeedStory({
      storyId: storyId('story-a'),

      seedArticleId: articleId(seed.id),

      canonicalTitle: seed.title,

      clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
    });

    expect(result.created).toBe(true);

    expect(result.story).toMatchObject({
      id: 'story-a',

      canonicalTitle: 'Seed article',

      seedArticleId: seed.id,

      representativeArticleId: seed.id,

      clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
    });

    expect(result.story.firstPublishedAt).toEqual(new Date('2026-09-01T10:00:00.000Z'));

    expect(result.story.lastPublishedAt).toEqual(new Date('2026-09-01T10:00:00.000Z'));

    expect(result.membership).toMatchObject({
      storyId: 'story-a',

      articleId: seed.id,

      kind: 'SEED',

      score: null,

      reason: null,

      matchedAgainstArticleId: null,

      clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
    });
  });

  it('replays seed creation idempotently', async () => {
    const seed = await persistArticle(
      'seed-replay',
      'Replay seed',
      new Date('2026-09-01T10:00:00.000Z'),
    );

    const repository = createStoryRepository(database);

    const input = {
      storyId: storyId('story-replay'),

      seedArticleId: articleId(seed.id),

      canonicalTitle: seed.title,

      clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
    };

    const first = await repository.createSeedStory(input);

    const second = await repository.createSeedStory(input);

    expect(first.created).toBe(true);

    expect(second.created).toBe(false);

    expect(
      await database.story.count({
        where: {
          id: 'story-replay',
        },
      }),
    ).toBe(1);

    expect(
      await database.storyMembership.count({
        where: {
          articleId: seed.id,
        },
      }),
    ).toBe(1);
  });

  it('adds a matched membership and expands the temporal envelope', async () => {
    const seed = await persistArticle(
      'envelope-seed',
      'Envelope story',
      new Date('2026-09-01T10:00:00.000Z'),
    );

    const earlier = await persistArticle(
      'envelope-earlier',
      'Earlier coverage',
      new Date('2026-09-01T09:00:00.000Z'),
    );

    const later = await persistArticle(
      'envelope-later',
      'Later coverage',
      new Date('2026-09-01T12:00:00.000Z'),
    );

    const repository = createStoryRepository(database);

    await repository.createSeedStory({
      storyId: storyId('story-envelope'),

      seedArticleId: articleId(seed.id),

      canonicalTitle: seed.title,

      clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
    });

    await repository.addMatchedMembership({
      storyId: storyId('story-envelope'),

      articleId: articleId(earlier.id),

      representativeArticleId: articleId(seed.id),

      matchDecision: decideStoryMatchV1(0.84),
    });

    const result = await repository.addMatchedMembership({
      storyId: storyId('story-envelope'),

      articleId: articleId(later.id),

      representativeArticleId: articleId(seed.id),

      matchDecision: decideStoryMatchV1(0.88),
    });

    expect(result.created).toBe(true);

    expect(result.story.firstPublishedAt).toEqual(new Date('2026-09-01T09:00:00.000Z'));

    expect(result.story.lastPublishedAt).toEqual(new Date('2026-09-01T12:00:00.000Z'));

    expect(
      await database.storyMembership.count({
        where: {
          storyId: 'story-envelope',
        },
      }),
    ).toBe(3);
  });

  it('replays the same matched membership idempotently', async () => {
    const seed = await persistArticle(
      'matched-replay-seed',
      'Matched replay seed',
      new Date('2026-09-01T10:00:00.000Z'),
    );

    const matched = await persistArticle(
      'matched-replay',
      'Matched replay',
      new Date('2026-09-01T10:10:00.000Z'),
    );

    const repository = createStoryRepository(database);

    await repository.createSeedStory({
      storyId: storyId('story-matched-replay'),

      seedArticleId: articleId(seed.id),

      canonicalTitle: seed.title,

      clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
    });

    const input = {
      storyId: storyId('story-matched-replay'),

      articleId: articleId(matched.id),

      representativeArticleId: articleId(seed.id),

      matchDecision: decideStoryMatchV1(0.83),
    };

    const first = await repository.addMatchedMembership(input);

    const second = await repository.addMatchedMembership(input);

    expect(first.created).toBe(true);

    expect(second.created).toBe(false);

    expect(
      await database.storyMembership.count({
        where: {
          articleId: matched.id,
        },
      }),
    ).toBe(1);
  });

  it('rejects silent reassignment to another story', async () => {
    const seedA = await persistArticle(
      'conflict-seed-a',
      'Story A',
      new Date('2026-09-01T10:00:00.000Z'),
    );

    const seedB = await persistArticle(
      'conflict-seed-b',
      'Story B',
      new Date('2026-09-01T10:01:00.000Z'),
    );

    const shared = await persistArticle(
      'conflict-shared',
      'Shared article',
      new Date('2026-09-01T10:02:00.000Z'),
    );

    const repository = createStoryRepository(database);

    await repository.createSeedStory({
      storyId: storyId('story-a'),

      seedArticleId: articleId(seedA.id),

      canonicalTitle: seedA.title,

      clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
    });

    await repository.createSeedStory({
      storyId: storyId('story-b'),

      seedArticleId: articleId(seedB.id),

      canonicalTitle: seedB.title,

      clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
    });

    await repository.addMatchedMembership({
      storyId: storyId('story-a'),

      articleId: articleId(shared.id),

      representativeArticleId: articleId(seedA.id),

      matchDecision: decideStoryMatchV1(0.84),
    });

    await expect(
      repository.addMatchedMembership({
        storyId: storyId('story-b'),

        articleId: articleId(shared.id),

        representativeArticleId: articleId(seedB.id),

        matchDecision: decideStoryMatchV1(0.86),
      }),
    ).rejects.toBeInstanceOf(StoryPersistenceConflictError);

    const persisted = await repository.findMembershipByArticleId(articleId(shared.id));

    expect(persisted?.storyId).toBe('story-a');
  });

  it('rejects a representative mismatch', async () => {
    const seed = await persistArticle(
      'representative-seed',
      'Representative seed',
      new Date('2026-09-01T10:00:00.000Z'),
    );

    const wrongRepresentative = await persistArticle(
      'wrong-representative',
      'Wrong representative',
      new Date('2026-09-01T10:01:00.000Z'),
    );

    const matched = await persistArticle(
      'representative-match',
      'Matched article',
      new Date('2026-09-01T10:02:00.000Z'),
    );

    const repository = createStoryRepository(database);

    await repository.createSeedStory({
      storyId: storyId('story-representative'),

      seedArticleId: articleId(seed.id),

      canonicalTitle: seed.title,

      clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
    });

    await expect(
      repository.addMatchedMembership({
        storyId: storyId('story-representative'),

        articleId: articleId(matched.id),

        representativeArticleId: articleId(wrongRepresentative.id),

        matchDecision: decideStoryMatchV1(0.9),
      }),
    ).rejects.toBeInstanceOf(StoryPersistenceConflictError);
  });

  it('allows only one story to win concurrent conflicting assignment', async () => {
    const seedA = await persistArticle(
      'race-seed-a',
      'Race story A',
      new Date('2026-09-01T10:00:00.000Z'),
    );

    const seedB = await persistArticle(
      'race-seed-b',
      'Race story B',
      new Date('2026-09-01T10:01:00.000Z'),
    );

    const contested = await persistArticle(
      'race-contested',
      'Contested coverage',
      new Date('2026-09-01T10:05:00.000Z'),
    );

    const repository = createStoryRepository(database);

    await repository.createSeedStory({
      storyId: storyId('story-race-a'),

      seedArticleId: articleId(seedA.id),

      canonicalTitle: seedA.title,

      clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
    });

    await repository.createSeedStory({
      storyId: storyId('story-race-b'),

      seedArticleId: articleId(seedB.id),

      canonicalTitle: seedB.title,

      clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
    });

    const results = await Promise.allSettled([
      repository.addMatchedMembership({
        storyId: storyId('story-race-a'),

        articleId: articleId(contested.id),

        representativeArticleId: articleId(seedA.id),

        matchDecision: decideStoryMatchV1(0.84),
      }),

      repository.addMatchedMembership({
        storyId: storyId('story-race-b'),

        articleId: articleId(contested.id),

        representativeArticleId: articleId(seedB.id),

        matchDecision: decideStoryMatchV1(0.85),
      }),
    ]);

    const fulfilled = results.filter(
      (
        result,
      ): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof repository.addMatchedMembership>>
      > => result.status === 'fulfilled',
    );

    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    expect(fulfilled).toHaveLength(1);

    expect(rejected).toHaveLength(1);

    expect(rejected[0]?.reason).toBeInstanceOf(StoryPersistenceConflictError);

    expect(
      await database.storyMembership.count({
        where: {
          articleId: contested.id,
        },
      }),
    ).toBe(1);

    const persisted = await repository.findMembershipByArticleId(articleId(contested.id));

    expect(['story-race-a', 'story-race-b']).toContain(persisted?.storyId);
  });
  it('adds the same matched membership concurrently without duplicates', async () => {
    const seed = await persistArticle(
      'concurrent-match-seed',
      'Concurrent match seed',
      new Date('2026-09-01T10:00:00.000Z'),
    );

    const matched = await persistArticle(
      'concurrent-match-article',
      'Concurrent matching coverage',
      new Date('2026-09-01T11:00:00.000Z'),
    );

    const repository = createStoryRepository(database);

    await repository.createSeedStory({
      storyId: storyId('story-concurrent-match'),

      seedArticleId: articleId(seed.id),

      canonicalTitle: seed.title,

      clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
    });

    const input = {
      storyId: storyId('story-concurrent-match'),

      articleId: articleId(matched.id),

      representativeArticleId: articleId(seed.id),

      matchDecision: decideStoryMatchV1(0.84),
    };

    const results = await Promise.all([
      repository.addMatchedMembership(input),

      repository.addMatchedMembership(input),
    ]);

    expect(results.map((result) => result.created).sort()).toEqual([false, true]);

    expect(
      await database.storyMembership.count({
        where: {
          articleId: matched.id,
        },
      }),
    ).toBe(1);

    const story = await repository.findById(storyId('story-concurrent-match'));

    expect(story?.firstPublishedAt).toEqual(new Date('2026-09-01T10:00:00.000Z'));

    expect(story?.lastPublishedAt).toEqual(new Date('2026-09-01T11:00:00.000Z'));
  });

  it('does not persist a partial story when the seed article is missing', async () => {
    const repository = createStoryRepository(database);

    await expect(
      repository.createSeedStory({
        storyId: storyId('story-missing-seed'),

        seedArticleId: articleId('missing-article'),

        canonicalTitle: 'Missing seed',

        clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
      }),
    ).rejects.toThrow('Cannot seed story from missing article');

    expect(
      await database.story.count({
        where: {
          id: 'story-missing-seed',
        },
      }),
    ).toBe(0);

    expect(
      await database.storyMembership.count({
        where: {
          storyId: 'story-missing-seed',
        },
      }),
    ).toBe(0);
  });

  it('does not mutate the temporal envelope when matched membership persistence fails', async () => {
    const seed = await persistArticle(
      'rollback-seed',
      'Rollback seed',
      new Date('2026-09-01T10:00:00.000Z'),
    );

    const repository = createStoryRepository(database);

    await repository.createSeedStory({
      storyId: storyId('story-rollback'),

      seedArticleId: articleId(seed.id),

      canonicalTitle: seed.title,

      clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
    });

    await expect(
      repository.addMatchedMembership({
        storyId: storyId('story-rollback'),

        articleId: articleId('missing-matched-article'),

        representativeArticleId: articleId(seed.id),

        matchDecision: decideStoryMatchV1(0.9),
      }),
    ).rejects.toThrow('Cannot add missing article to story');

    const story = await repository.findById(storyId('story-rollback'));

    expect(story?.firstPublishedAt).toEqual(new Date('2026-09-01T10:00:00.000Z'));

    expect(story?.lastPublishedAt).toEqual(new Date('2026-09-01T10:00:00.000Z'));

    expect(
      await database.storyMembership.count({
        where: {
          storyId: 'story-rollback',
        },
      }),
    ).toBe(1);
  });
  it('creates the same seed story concurrently without duplicate state', async () => {
    const seed = await persistArticle(
      'concurrent-seed',
      'Concurrent seed',
      new Date('2026-09-01T10:00:00.000Z'),
    );

    const repository = createStoryRepository(database);

    const input = {
      storyId: storyId('story-concurrent-seed'),

      seedArticleId: articleId(seed.id),

      canonicalTitle: seed.title,

      clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
    };

    const results = await Promise.all([
      repository.createSeedStory(input),

      repository.createSeedStory(input),
    ]);

    expect(results.map((result) => result.created).sort()).toEqual([false, true]);

    expect(
      await database.story.count({
        where: {
          id: 'story-concurrent-seed',
        },
      }),
    ).toBe(1);

    expect(
      await database.storyMembership.count({
        where: {
          articleId: seed.id,
        },
      }),
    ).toBe(1);

    const persisted = await repository.findById(storyId('story-concurrent-seed'));

    expect(persisted?.seedArticleId).toBe(seed.id);

    expect(persisted?.representativeArticleId).toBe(seed.id);
  });
});

async function persistArticle(suffix: string, title: string, publishedAt: Date | null) {
  const repository = createArticleRepository(database);

  const article: NormalizedArticle = {
    title,

    url: `${testUrlPrefix}${suffix}`,

    canonicalUrl: `${testUrlPrefix}${suffix}`,

    source: {
      id: 'integration',
      name: 'Integration',
      type: 'api',
    },

    publisher: null,

    externalId: `external-${suffix}`,

    publishedAt,

    discoveredAt: new Date('2026-09-01T13:00:00.000Z'),

    author: null,
    summary: null,
    category: null,
    metadata: null,
  };

  return repository.persist(article);
}
