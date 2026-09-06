import {
  createArticleRepository,
  createPrismaClient,
  type DatabaseClient,
} from '@genai-news/database';

import {
  INITIAL_STORY_CLUSTERING_VERSION,
  type NormalizedArticle,
  type StoryArticleId,
} from '@genai-news/shared';

import type {
  SemanticEmbeddingClient,
  SemanticEmbeddingRequest,
  SemanticEmbeddingResult,
} from '@genai-news/tools';

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createProductionStoryClusteringService } from '../src/news/story-clustering/index.js';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for story clustering integration tests');
}

const testUrlPrefix = 'https://story-clustering.integration.example.com/';

let database: DatabaseClient;

function articleId(value: string): StoryArticleId {
  return value as StoryArticleId;
}

describe('incremental story clustering integration', () => {
  beforeEach(async () => {
    database = database ?? createPrismaClient(databaseUrl);

    await cleanup();
  });

  afterAll(async () => {
    if (database) {
      await cleanup();

      await database.$disconnect();
    }
  });

  it('seeds a new story for the first article', async () => {
    const article = await persistArticle(
      'first',
      'OpenAI launches new enterprise AI platform',
      new Date('2026-09-01T10:00:00.000Z'),
    );

    const embeddingClient = createDeterministicEmbeddingClient(new Map([[article.title, [1, 0]]]));

    const service = createProductionStoryClusteringService({
      database,

      embeddingClient,

      candidatePolicy: {
        maxTimeDistanceMs: 24 * 60 * 60 * 1000,

        includeWhenTimeUnknown: false,
      },
    });

    const result = await service.clusterArticle(articleId(article.id));

    expect(result.kind).toBe('seeded-new-story');

    if (result.kind !== 'seeded-new-story') {
      throw new Error('Expected seeded-new-story result.');
    }

    expect(result.reason).toBe('no-candidates');

    const persistedStory = await database.story.findUnique({
      where: {
        id: result.storyId,
      },
    });

    expect(persistedStory).not.toBeNull();

    expect(persistedStory?.seedArticleId).toBe(article.id);

    expect(persistedStory?.representativeArticleId).toBe(article.id);

    expect(persistedStory?.canonicalTitle).toBe(article.title);

    expect(persistedStory?.clusteringVersion).toBe(INITIAL_STORY_CLUSTERING_VERSION);

    const membership = await database.storyMembership.findUnique({
      where: {
        articleId: article.id,
      },
    });

    expect(membership).toMatchObject({
      storyId: result.storyId,

      articleId: article.id,

      kind: 'SEED',

      score: null,

      reason: null,

      matchedAgainstArticleId: null,

      clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
    });
  });

  it('assigns a semantically matching article to an existing story', async () => {
    const seed = await persistArticle(
      'matching-seed',
      'OpenAI launches enterprise AI platform',
      new Date('2026-09-01T10:00:00.000Z'),
    );

    const incoming = await persistArticle(
      'matching-incoming',
      'OpenAI unveils enterprise AI platform',
      new Date('2026-09-01T11:00:00.000Z'),
    );

    const embeddingClient = createDeterministicEmbeddingClient(
      new Map([
        [seed.title, [1, 0]],

        [incoming.title, [0.8, 0.6]],
      ]),
    );

    const service = createProductionStoryClusteringService({
      database,

      embeddingClient,

      candidatePolicy: {
        maxTimeDistanceMs: 24 * 60 * 60 * 1000,

        includeWhenTimeUnknown: false,
      },
    });

    const seedResult = await service.clusterArticle(articleId(seed.id));

    expect(seedResult.kind).toBe('seeded-new-story');

    if (seedResult.kind !== 'seeded-new-story') {
      throw new Error('Expected seed result.');
    }

    const result = await service.clusterArticle(articleId(incoming.id));

    expect(result).toMatchObject({
      kind: 'assigned-existing-story',

      articleId: incoming.id,

      storyId: seedResult.storyId,

      representativeArticleId: seed.id,

      semanticSimilarity: 0.8,

      persisted: true,
    });

    expect(
      await database.storyMembership.count({
        where: {
          storyId: seedResult.storyId,
        },
      }),
    ).toBe(2);

    const membership = await database.storyMembership.findUnique({
      where: {
        articleId: incoming.id,
      },
    });

    expect(membership).toMatchObject({
      storyId: seedResult.storyId,

      articleId: incoming.id,

      kind: 'MATCHED',

      score: 0.8,

      reason: 'semantic-similarity-at-or-above-v1-threshold',

      matchedAgainstArticleId: seed.id,

      clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
    });

    const story = await database.story.findUnique({
      where: {
        id: seedResult.storyId,
      },
    });

    expect(story?.representativeArticleId).toBe(seed.id);

    expect(story?.canonicalTitle).toBe(seed.title);

    expect(story?.lastPublishedAt).toEqual(new Date('2026-09-01T11:00:00.000Z'));
  });

  it('seeds a different story when semantic similarity is below threshold', async () => {
    const first = await persistArticle(
      'different-a',
      'Company announces quarterly earnings',
      new Date('2026-09-01T10:00:00.000Z'),
    );

    const second = await persistArticle(
      'different-b',
      'Company launches new AI product',
      new Date('2026-09-01T10:30:00.000Z'),
    );

    const embeddingClient = createDeterministicEmbeddingClient(
      new Map([
        [first.title, [1, 0]],

        [second.title, [0, 1]],
      ]),
    );

    const service = createProductionStoryClusteringService({
      database,

      embeddingClient,

      candidatePolicy: {
        maxTimeDistanceMs: 24 * 60 * 60 * 1000,

        includeWhenTimeUnknown: false,
      },
    });

    const firstResult = await service.clusterArticle(articleId(first.id));

    const secondResult = await service.clusterArticle(articleId(second.id));

    expect(firstResult.kind).toBe('seeded-new-story');

    expect(secondResult.kind).toBe('seeded-new-story');

    if (firstResult.kind !== 'seeded-new-story' || secondResult.kind !== 'seeded-new-story') {
      throw new Error('Expected both articles to seed stories.');
    }

    expect(secondResult.reason).toBe('no-matching-candidates');

    expect(secondResult.storyId).not.toBe(firstResult.storyId);

    expect(
      await database.story.count({
        where: {
          seedArticle: {
            canonicalUrl: {
              startsWith: testUrlPrefix,
            },
          },
        },
      }),
    ).toBe(2);
  });

  it('handles concurrent first-time matching of the same article without duplicate membership', async () => {
    const seed = await persistArticle(
      'concurrent-match-seed',
      'OpenAI launches concurrent enterprise AI platform',
      new Date('2026-09-01T10:00:00.000Z'),
    );

    const incoming = await persistArticle(
      'concurrent-match-incoming',
      'OpenAI unveils concurrent enterprise AI platform',
      new Date('2026-09-01T11:00:00.000Z'),
    );

    const embeddingClient = createDeterministicEmbeddingClient(
      new Map([
        [seed.title, [1, 0]],

        [incoming.title, [0.8, 0.6]],
      ]),
    );

    const service = createProductionStoryClusteringService({
      database,

      embeddingClient,

      candidatePolicy: {
        maxTimeDistanceMs: 24 * 60 * 60 * 1000,

        includeWhenTimeUnknown: false,
      },
    });

    const seedResult = await service.clusterArticle(articleId(seed.id));

    expect(seedResult.kind).toBe('seeded-new-story');

    if (seedResult.kind !== 'seeded-new-story') {
      throw new Error('Expected seed article to create a story.');
    }

    const results = await Promise.all([
      service.clusterArticle(articleId(incoming.id)),

      service.clusterArticle(articleId(incoming.id)),
    ]);

    expect(results.every((result) => result.storyId === seedResult.storyId)).toBe(true);

    expect(
      await database.storyMembership.count({
        where: {
          articleId: incoming.id,
        },
      }),
    ).toBe(1);

    const membership = await database.storyMembership.findUnique({
      where: {
        articleId: incoming.id,
      },
    });

    expect(membership).toMatchObject({
      storyId: seedResult.storyId,

      articleId: incoming.id,

      kind: 'MATCHED',

      matchedAgainstArticleId: seed.id,

      clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
    });

    expect(
      results.filter((result) => result.kind === 'assigned-existing-story' && result.persisted),
    ).toHaveLength(1);

    expect(
      await database.story.count({
        where: {
          seedArticle: {
            canonicalUrl: {
              startsWith: testUrlPrefix,
            },
          },
        },
      }),
    ).toBe(1);

    expect(
      await database.storyMembership.count({
        where: {
          storyId: seedResult.storyId,
        },
      }),
    ).toBe(2);
  });

  it('handles concurrent first-time clustering of the same seed article without duplicate state', async () => {
    const article = await persistArticle(
      'concurrent-first-seed',
      'Concurrent first seed article',
      new Date('2026-09-01T13:00:00.000Z'),
    );

    const embeddingClient = createDeterministicEmbeddingClient(new Map([[article.title, [1, 0]]]));

    const service = createProductionStoryClusteringService({
      database,

      embeddingClient,

      candidatePolicy: {
        maxTimeDistanceMs: 24 * 60 * 60 * 1000,

        includeWhenTimeUnknown: false,
      },
    });

    const results = await Promise.all([
      service.clusterArticle(articleId(article.id)),

      service.clusterArticle(articleId(article.id)),
    ]);

    expect(results.every((result) => result.articleId === article.id)).toBe(true);

    const membership = await database.storyMembership.findUnique({
      where: {
        articleId: article.id,
      },
    });

    expect(membership).not.toBeNull();

    expect(
      await database.storyMembership.count({
        where: {
          articleId: article.id,
        },
      }),
    ).toBe(1);

    expect(
      await database.story.count({
        where: {
          seedArticle: {
            canonicalUrl: {
              startsWith: testUrlPrefix,
            },
          },
        },
      }),
    ).toBe(1);

    expect(new Set(results.map((result) => result.storyId)).size).toBe(1);

    expect(
      results.filter((result) => result.kind === 'seeded-new-story' && result.persisted),
    ).toHaveLength(1);

    expect(membership?.storyId).toBe(results[0]?.storyId);
  });

  it('seeds conservatively when two existing stories both match', async () => {
    const seedA = await persistArticle(
      'ambiguous-a',
      'Company launches AI platform A',
      new Date('2026-09-01T10:00:00.000Z'),
    );

    const seedB = await persistArticle(
      'ambiguous-b',
      'Company launches AI platform B',
      new Date('2026-09-01T10:10:00.000Z'),
    );

    const incoming = await persistArticle(
      'ambiguous-incoming',
      'Company launches AI platform',
      new Date('2026-09-01T10:20:00.000Z'),
    );

    const embeddingClient = createDeterministicEmbeddingClient(
      new Map([
        [seedA.title, [1, 0]],

        [seedB.title, [0.9, 0.435889894]],

        [incoming.title, [0.95, 0.3122499]],
      ]),
    );

    const service = createProductionStoryClusteringService({
      database,

      embeddingClient,

      candidatePolicy: {
        maxTimeDistanceMs: 24 * 60 * 60 * 1000,

        includeWhenTimeUnknown: false,
      },
    });

    const first = await service.clusterArticle(articleId(seedA.id));

    expect(first.kind).toBe('seeded-new-story');

    /**
     * Force seed B to become an independent story
     * instead of matching A.
     */
    const isolatedService = createProductionStoryClusteringService({
      database,

      embeddingClient: createDeterministicEmbeddingClient(
        new Map([
          [seedA.title, [1, 0]],

          [seedB.title, [0, 1]],
        ]),
      ),

      candidatePolicy: {
        maxTimeDistanceMs: 24 * 60 * 60 * 1000,

        includeWhenTimeUnknown: false,
      },
    });

    const second = await isolatedService.clusterArticle(articleId(seedB.id));

    expect(second.kind).toBe('seeded-new-story');

    const result = await service.clusterArticle(articleId(incoming.id));

    expect(result).toMatchObject({
      kind: 'seeded-new-story',

      reason: 'ambiguous-matching-candidates',
    });

    expect(
      await database.story.count({
        where: {
          seedArticle: {
            canonicalUrl: {
              startsWith: testUrlPrefix,
            },
          },
        },
      }),
    ).toBe(3);
  });

  it('keeps story identity and database cardinality stable across repeated replay', async () => {
    const article = await persistArticle(
      'repeated-replay',
      'Repeated replay stability article',
      new Date('2026-09-01T12:00:00.000Z'),
    );

    const embeddingClient = createDeterministicEmbeddingClient(new Map([[article.title, [1, 0]]]));

    const embedSpy = vi.spyOn(embeddingClient, 'embed');

    const service = createProductionStoryClusteringService({
      database,

      embeddingClient,

      candidatePolicy: {
        maxTimeDistanceMs: 24 * 60 * 60 * 1000,

        includeWhenTimeUnknown: false,
      },
    });

    const first = await service.clusterArticle(articleId(article.id));

    expect(first.kind).toBe('seeded-new-story');

    if (first.kind !== 'seeded-new-story') {
      throw new Error('Expected first clustering attempt to seed a story.');
    }

    const embeddingCallsAfterFirst = embedSpy.mock.calls.length;

    const replayResults = await Promise.all([
      service.clusterArticle(articleId(article.id)),

      service.clusterArticle(articleId(article.id)),

      service.clusterArticle(articleId(article.id)),

      service.clusterArticle(articleId(article.id)),
    ]);

    for (const replay of replayResults) {
      expect(replay).toEqual({
        kind: 'already-assigned',

        articleId: article.id,

        storyId: first.storyId,
      });
    }

    expect(embedSpy.mock.calls.length).toBe(embeddingCallsAfterFirst);

    expect(
      await database.story.count({
        where: {
          seedArticle: {
            canonicalUrl: {
              startsWith: testUrlPrefix,
            },
          },
        },
      }),
    ).toBe(1);

    expect(
      await database.storyMembership.count({
        where: {
          article: {
            canonicalUrl: {
              startsWith: testUrlPrefix,
            },
          },
        },
      }),
    ).toBe(1);

    const membership = await database.storyMembership.findUnique({
      where: {
        articleId: article.id,
      },
    });

    expect(membership?.storyId).toBe(first.storyId);
  });

  it('replays an existing-story assignment without changing membership state', async () => {
    const seed = await persistArticle(
      'matched-replay-seed',
      'OpenAI launches enterprise AI platform',
      new Date('2026-09-01T10:00:00.000Z'),
    );

    const incoming = await persistArticle(
      'matched-replay-incoming',
      'OpenAI unveils enterprise AI platform',
      new Date('2026-09-01T11:00:00.000Z'),
    );

    const embeddingClient = createDeterministicEmbeddingClient(
      new Map([
        [seed.title, [1, 0]],

        [incoming.title, [0.8, 0.6]],
      ]),
    );

    const embedSpy = vi.spyOn(embeddingClient, 'embed');

    const service = createProductionStoryClusteringService({
      database,

      embeddingClient,

      candidatePolicy: {
        maxTimeDistanceMs: 24 * 60 * 60 * 1000,

        includeWhenTimeUnknown: false,
      },
    });

    const seedResult = await service.clusterArticle(articleId(seed.id));

    expect(seedResult.kind).toBe('seeded-new-story');

    if (seedResult.kind !== 'seeded-new-story') {
      throw new Error('Expected seed article to create a story.');
    }

    const firstAssignment = await service.clusterArticle(articleId(incoming.id));

    expect(firstAssignment).toMatchObject({
      kind: 'assigned-existing-story',

      articleId: incoming.id,

      storyId: seedResult.storyId,

      representativeArticleId: seed.id,

      semanticSimilarity: 0.8,

      persisted: true,
    });

    const membershipBeforeReplay = await database.storyMembership.findUnique({
      where: {
        articleId: incoming.id,
      },
    });

    expect(membershipBeforeReplay).not.toBeNull();

    const embeddingCallsBeforeReplay = embedSpy.mock.calls.length;

    const replay = await service.clusterArticle(articleId(incoming.id));

    expect(replay).toEqual({
      kind: 'already-assigned',

      articleId: incoming.id,

      storyId: seedResult.storyId,
    });

    expect(embedSpy.mock.calls.length).toBe(embeddingCallsBeforeReplay);

    const membershipAfterReplay = await database.storyMembership.findUnique({
      where: {
        articleId: incoming.id,
      },
    });

    expect(membershipAfterReplay).toEqual(membershipBeforeReplay);

    expect(
      await database.story.count({
        where: {
          seedArticle: {
            canonicalUrl: {
              startsWith: testUrlPrefix,
            },
          },
        },
      }),
    ).toBe(1);

    expect(
      await database.storyMembership.count({
        where: {
          article: {
            canonicalUrl: {
              startsWith: testUrlPrefix,
            },
          },
        },
      }),
    ).toBe(2);
  });

  it('replays a seeded article idempotently without creating duplicate story state', async () => {
    const article = await persistArticle(
      'replay-seed',
      'Replay clustering article',
      new Date('2026-09-01T10:00:00.000Z'),
    );

    const embeddingClient = createDeterministicEmbeddingClient(new Map([[article.title, [1, 0]]]));

    const embedSpy = vi.spyOn(embeddingClient, 'embed');

    const service = createProductionStoryClusteringService({
      database,

      embeddingClient,

      candidatePolicy: {
        maxTimeDistanceMs: 24 * 60 * 60 * 1000,

        includeWhenTimeUnknown: false,
      },
    });

    const first = await service.clusterArticle(articleId(article.id));

    expect(first.kind).toBe('seeded-new-story');

    if (first.kind !== 'seeded-new-story') {
      throw new Error('Expected seeded-new-story result.');
    }

    expect(first.persisted).toBe(true);

    const embeddingCallsAfterFirst = embedSpy.mock.calls.length;

    const second = await service.clusterArticle(articleId(article.id));

    expect(second).toEqual({
      kind: 'already-assigned',

      articleId: article.id,

      storyId: first.storyId,
    });

    /**
     * Replay must stop at the membership boundary.
     *
     * No semantic work should be recomputed.
     */
    expect(embedSpy.mock.calls.length).toBe(embeddingCallsAfterFirst);

    expect(
      await database.story.count({
        where: {
          seedArticle: {
            canonicalUrl: {
              startsWith: testUrlPrefix,
            },
          },
        },
      }),
    ).toBe(1);

    expect(
      await database.storyMembership.count({
        where: {
          article: {
            canonicalUrl: {
              startsWith: testUrlPrefix,
            },
          },
        },
      }),
    ).toBe(1);

    const membership = await database.storyMembership.findUnique({
      where: {
        articleId: article.id,
      },
    });

    expect(membership).toMatchObject({
      storyId: first.storyId,

      articleId: article.id,

      kind: 'SEED',

      clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
    });
  });

  it('allows only one winner when concurrent clustering attempts assign the same article to different stories', async () => {
    const seedA = await persistArticle(
      'competing-seed-a',
      'Company launches AI platform Alpha',
      new Date('2026-09-01T10:00:00.000Z'),
    );

    const seedB = await persistArticle(
      'competing-seed-b',
      'Company launches AI platform Beta',
      new Date('2026-09-01T10:10:00.000Z'),
    );

    const incoming = await persistArticle(
      'competing-incoming',
      'Company launches new AI platform',
      new Date('2026-09-01T10:20:00.000Z'),
    );

    const seedAService = createProductionStoryClusteringService({
      database,

      embeddingClient: createDeterministicEmbeddingClient(
        new Map([
          [seedA.title, [1, 0]],
          [seedB.title, [0, 1]],
        ]),
      ),

      candidatePolicy: {
        maxTimeDistanceMs: 24 * 60 * 60 * 1000,

        includeWhenTimeUnknown: false,
      },
    });

    const seedAResult = await seedAService.clusterArticle(articleId(seedA.id));

    expect(seedAResult.kind).toBe('seeded-new-story');

    if (seedAResult.kind !== 'seeded-new-story') {
      throw new Error('Expected seed A to create a story.');
    }

    const seedBService = createProductionStoryClusteringService({
      database,

      embeddingClient: createDeterministicEmbeddingClient(
        new Map([
          [seedA.title, [1, 0]],
          [seedB.title, [0, 1]],
        ]),
      ),

      candidatePolicy: {
        maxTimeDistanceMs: 24 * 60 * 60 * 1000,

        includeWhenTimeUnknown: false,
      },
    });

    const seedBResult = await seedBService.clusterArticle(articleId(seedB.id));

    expect(seedBResult.kind).toBe('seeded-new-story');

    if (seedBResult.kind !== 'seeded-new-story') {
      throw new Error('Expected seed B to create a story.');
    }

    const serviceForA = createProductionStoryClusteringService({
      database,

      embeddingClient: createDeterministicEmbeddingClient(
        new Map([
          [seedA.title, [1, 0]],
          [seedB.title, [0, 1]],
          [incoming.title, [1, 0]],
        ]),
      ),

      candidatePolicy: {
        maxTimeDistanceMs: 24 * 60 * 60 * 1000,

        includeWhenTimeUnknown: false,
      },
    });

    const serviceForB = createProductionStoryClusteringService({
      database,

      embeddingClient: createDeterministicEmbeddingClient(
        new Map([
          [seedA.title, [0, 1]],
          [seedB.title, [1, 0]],
          [incoming.title, [1, 0]],
        ]),
      ),

      candidatePolicy: {
        maxTimeDistanceMs: 24 * 60 * 60 * 1000,

        includeWhenTimeUnknown: false,
      },
    });

    const results = await Promise.allSettled([
      serviceForA.clusterArticle(articleId(incoming.id)),

      serviceForB.clusterArticle(articleId(incoming.id)),
    ]);

    const fulfilled = results.filter(
      (
        result,
      ): result is PromiseFulfilledResult<Awaited<ReturnType<typeof serviceForA.clusterArticle>>> =>
        result.status === 'fulfilled',
    );

    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    expect(fulfilled).toHaveLength(1);

    expect(rejected).toHaveLength(1);

    const membership = await database.storyMembership.findUnique({
      where: {
        articleId: incoming.id,
      },
    });

    expect(membership).not.toBeNull();

    expect([seedAResult.storyId, seedBResult.storyId]).toContain(membership?.storyId);

    expect(
      await database.storyMembership.count({
        where: {
          articleId: incoming.id,
        },
      }),
    ).toBe(1);

    expect(
      await database.storyMembership.count({
        where: {
          storyId: {
            in: [seedAResult.storyId, seedBResult.storyId],
          },

          articleId: incoming.id,
        },
      }),
    ).toBe(1);
  });

  it('excludes temporally distant stories before semantic embedding', async () => {
    const oldArticle = await persistArticle(
      'old-story',
      'Old AI event',
      new Date('2026-08-01T10:00:00.000Z'),
    );

    const incoming = await persistArticle(
      'new-story',
      'New AI event',
      new Date('2026-09-01T10:00:00.000Z'),
    );

    const embeddingClient = createDeterministicEmbeddingClient(
      new Map([
        [oldArticle.title, [1, 0]],

        [incoming.title, [1, 0]],
      ]),
    );

    const embedSpy = vi.spyOn(embeddingClient, 'embed');

    const service = createProductionStoryClusteringService({
      database,

      embeddingClient,

      candidatePolicy: {
        maxTimeDistanceMs: 60 * 60 * 1000,

        includeWhenTimeUnknown: false,
      },
    });

    await service.clusterArticle(articleId(oldArticle.id));

    const callsBeforeIncoming = embedSpy.mock.calls.length;

    const result = await service.clusterArticle(articleId(incoming.id));

    expect(result).toMatchObject({
      kind: 'seeded-new-story',

      reason: 'no-candidates',
    });

    /**
     * No semantic request should be issued for
     * the temporally excluded old story.
     */
    expect(embedSpy.mock.calls.length).toBe(callsBeforeIncoming);
  });

  it('does not persist story state when semantic comparison fails', async () => {
    const seed = await persistArticle(
      'semantic-failure-seed',
      'OpenAI launches semantic failure platform',
      new Date('2026-09-01T10:00:00.000Z'),
    );

    const incoming = await persistArticle(
      'semantic-failure-incoming',
      'OpenAI unveils semantic failure platform',
      new Date('2026-09-01T11:00:00.000Z'),
    );

    const seedService = createProductionStoryClusteringService({
      database,

      embeddingClient: createDeterministicEmbeddingClient(new Map([[seed.title, [1, 0]]])),

      candidatePolicy: {
        maxTimeDistanceMs: 24 * 60 * 60 * 1000,
        includeWhenTimeUnknown: false,
      },
    });

    const seedResult = await seedService.clusterArticle(articleId(seed.id));

    expect(seedResult.kind).toBe('seeded-new-story');

    const failingEmbeddingClient: SemanticEmbeddingClient = {
      async embed() {
        throw new Error('semantic comparison unavailable');
      },
    };

    const failingService = createProductionStoryClusteringService({
      database,

      embeddingClient: failingEmbeddingClient,

      candidatePolicy: {
        maxTimeDistanceMs: 24 * 60 * 60 * 1000,
        includeWhenTimeUnknown: false,
      },
    });

    await expect(failingService.clusterArticle(articleId(incoming.id))).rejects.toThrow(
      'semantic comparison unavailable',
    );

    expect(
      await database.storyMembership.findUnique({
        where: {
          articleId: incoming.id,
        },
      }),
    ).toBeNull();

    expect(
      await database.story.count({
        where: {
          seedArticleId: incoming.id,
        },
      }),
    ).toBe(0);
  });
});

function createDeterministicEmbeddingClient(
  embeddingByText: ReadonlyMap<string, readonly number[]>,
): SemanticEmbeddingClient {
  return {
    async embed(
      inputs: readonly SemanticEmbeddingRequest[],
    ): Promise<readonly SemanticEmbeddingResult[]> {
      return inputs.map((input) => {
        const embedding = embeddingByText.get(input.text);

        if (embedding === undefined) {
          throw new Error(`Missing deterministic embedding for text: ${input.text}`);
        }

        return {
          id: input.id,

          embedding,
        };
      });
    },
  };
}

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

    discoveredAt: new Date('2026-09-01T16:00:00.000Z'),

    author: null,
    summary: null,
    category: null,
    metadata: null,
  };

  return repository.persist(article);
}

async function cleanup(): Promise<void> {
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
