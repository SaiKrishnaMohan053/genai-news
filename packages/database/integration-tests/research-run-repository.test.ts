import {
  createArticleRepository,
  createPrismaClient,
  createResearchRunRepository,
  createStoryRepository,
  ResearchPersistenceConflictError,
  type DatabaseClient,
} from '../src/index.js';

import {
  INITIAL_STORY_CLUSTERING_VERSION,
  type NormalizedArticle,
  type ResearchBudget,
  type StoryArticleId,
  type StoryId,
} from '@genai-news/shared';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for database integration tests');
}

const testUrlPrefix = 'https://research-run-repository.integration.example.com/';

const budget: ResearchBudget = {
  maxToolCalls: 6,

  maxModelCalls: 4,

  timeoutMs: 30_000,

  maxSelectedSources: 5,

  maxUnresolvedQuestions: 3,

  maxQuestionLength: 300,
};

let database: DatabaseClient;

describe('research run repository integration', () => {
  beforeEach(async () => {
    database = database ?? createPrismaClient(databaseUrl);

    await database.researchRun.deleteMany({
      where: {
        story: {
          seedArticle: {
            canonicalUrl: {
              startsWith: testUrlPrefix,
            },
          },
        },
      },
    });

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
    if (!database) {
      return;
    }

    await database.researchRun.deleteMany({
      where: {
        story: {
          seedArticle: {
            canonicalUrl: {
              startsWith: testUrlPrefix,
            },
          },
        },
      },
    });

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
  });

  it('creates a pending research run', async () => {
    const story = await createTestStory('create');

    const repository = createResearchRunRepository(database);

    const result = await repository.createPending({
      researchRunId: 'research-create',

      storyId: story.id,

      idempotencyKey: 'research:create:key',

      researchGoal: 'Find stronger source coverage.',

      budget,
    });

    expect(result.created).toBe(true);

    expect(result.run).toMatchObject({
      id: 'research-create',

      storyId: story.id,

      idempotencyKey: 'research:create:key',

      status: 'PENDING',

      researchGoal: 'Find stronger source coverage.',

      outcome: null,

      stopReason: null,

      selection: null,

      modelCalls: 0,
      toolCalls: 0,
      executionToken: null,
      leaseExpiresAt: null,
      startedAt: null,

      completedAt: null,
    });

    expect(result.run.budget).toEqual(budget);
  });

  it('replays the exact request idempotently', async () => {
    const story = await createTestStory('replay');

    const repository = createResearchRunRepository(database);

    const input = {
      researchRunId: 'research-replay',

      storyId: story.id,

      idempotencyKey: 'research:replay:key',

      researchGoal: 'Find official sources.',

      budget,
    };

    const first = await repository.createPending(input);

    const second = await repository.createPending(input);

    expect(first.created).toBe(true);

    expect(second.created).toBe(false);

    expect(second.run.id).toBe(first.run.id);

    expect(
      await database.researchRun.count({
        where: {
          idempotencyKey: 'research:replay:key',
        },
      }),
    ).toBe(1);
  });

  it('rejects the same idempotency key with different request state', async () => {
    const story = await createTestStory('key-conflict');

    const repository = createResearchRunRepository(database);

    await repository.createPending({
      researchRunId: 'research-key-conflict-a',

      storyId: story.id,

      idempotencyKey: 'research:key-conflict',

      researchGoal: 'Goal A',

      budget,
    });

    await expect(
      repository.createPending({
        researchRunId: 'research-key-conflict-b',

        storyId: story.id,

        idempotencyKey: 'research:key-conflict',

        researchGoal: 'Goal B',

        budget,
      }),
    ).rejects.toBeInstanceOf(ResearchPersistenceConflictError);

    expect(
      await database.researchRun.count({
        where: {
          idempotencyKey: 'research:key-conflict',
        },
      }),
    ).toBe(1);
  });

  it('rejects reuse of a research run id with another idempotency key', async () => {
    const story = await createTestStory('id-conflict');

    const repository = createResearchRunRepository(database);

    await repository.createPending({
      researchRunId: 'research-id-conflict',

      storyId: story.id,

      idempotencyKey: 'research:id:key-a',

      budget,
    });

    await expect(
      repository.createPending({
        researchRunId: 'research-id-conflict',

        storyId: story.id,

        idempotencyKey: 'research:id:key-b',

        budget,
      }),
    ).rejects.toBeInstanceOf(ResearchPersistenceConflictError);
  });

  it('does not create a run for a missing story', async () => {
    const repository = createResearchRunRepository(database);

    await expect(
      repository.createPending({
        researchRunId: 'research-missing-story',

        storyId: 'missing-story',

        idempotencyKey: 'research:missing-story',

        budget,
      }),
    ).rejects.toThrow('Cannot create research run for missing story');

    expect(
      await database.researchRun.count({
        where: {
          id: 'research-missing-story',
        },
      }),
    ).toBe(0);
  });

  it('finds a persisted run by id and idempotency key', async () => {
    const story = await createTestStory('find');

    const repository = createResearchRunRepository(database);

    await repository.createPending({
      researchRunId: 'research-find',

      storyId: story.id,

      idempotencyKey: 'research:find:key',

      budget,
    });

    const byId = await repository.findById('research-find');

    const byKey = await repository.findByIdempotencyKey('research:find:key');

    expect(byId?.id).toBe('research-find');

    expect(byKey?.id).toBe('research-find');

    expect(byId).toEqual(byKey);
  });

  it('creates concurrent identical requests without duplicate rows', async () => {
    const story = await createTestStory('concurrent');

    const repository = createResearchRunRepository(database);

    const input = {
      researchRunId: 'research-concurrent',

      storyId: story.id,

      idempotencyKey: 'research:concurrent:key',

      researchGoal: 'Find related coverage.',

      budget,
    };

    const results = await Promise.all([
      repository.createPending(input),

      repository.createPending(input),
    ]);

    expect(results.map((result) => result.created).sort()).toEqual([false, true]);

    expect(new Set(results.map((result) => result.run.id)).size).toBe(1);

    expect(
      await database.researchRun.count({
        where: {
          idempotencyKey: 'research:concurrent:key',
        },
      }),
    ).toBe(1);
  });

  it('atomically claims a pending run', async () => {
    const story = await createTestStory('claim');
    const repository = createResearchRunRepository(database);

    await repository.createPending({
      researchRunId: 'research-claim',
      storyId: story.id,
      idempotencyKey: 'research:claim:key',
      budget,
    });

    const claimedAt = new Date('2026-09-29T13:00:00.000Z');
    const leaseExpiresAt = new Date('2026-09-29T13:05:00.000Z');

    const result = await repository.claim({
      researchRunId: 'research-claim',
      executionToken: 'token-claim',
      claimedAt,
      leaseExpiresAt,
    });

    expect(result.claimed).toBe(true);
    expect(result.run).toMatchObject({
      status: 'RUNNING',
      executionToken: 'token-claim',
      leaseExpiresAt,
      startedAt: claimedAt,
    });
  });

  it('allows exactly one concurrent claimant', async () => {
    const story = await createTestStory('concurrent-claim');
    const repository = createResearchRunRepository(database);

    await repository.createPending({
      researchRunId: 'research-concurrent-claim',
      storyId: story.id,
      idempotencyKey: 'research:concurrent-claim:key',
      budget,
    });

    const claimedAt = new Date('2026-09-29T13:00:00.000Z');
    const leaseExpiresAt = new Date('2026-09-29T13:05:00.000Z');

    const results = await Promise.all([
      repository.claim({
        researchRunId: 'research-concurrent-claim',
        executionToken: 'token-concurrent-a',
        claimedAt,
        leaseExpiresAt,
      }),
      repository.claim({
        researchRunId: 'research-concurrent-claim',
        executionToken: 'token-concurrent-b',
        claimedAt,
        leaseExpiresAt,
      }),
    ]);

    expect(results.map((result) => result.claimed).sort()).toEqual([false, true]);
    expect(results.every((result) => result.run.status === 'RUNNING')).toBe(true);
  });

  it('does not reclaim a running research run with an active lease', async () => {
    const story = await createTestStory('active-lease');
    const repository = createResearchRunRepository(database);

    await repository.createPending({
      researchRunId: 'research-active-lease',
      storyId: story.id,
      idempotencyKey: 'research:active-lease:key',
      budget,
    });

    await repository.claim({
      researchRunId: 'research-active-lease',
      executionToken: 'token-first',
      claimedAt: new Date('2026-09-29T13:00:00.000Z'),
      leaseExpiresAt: new Date('2026-09-29T13:05:00.000Z'),
    });

    const replay = await repository.claim({
      researchRunId: 'research-active-lease',
      executionToken: 'token-second',
      claimedAt: new Date('2026-09-29T13:04:00.000Z'),
      leaseExpiresAt: new Date('2026-09-29T13:09:00.000Z'),
    });

    expect(replay.claimed).toBe(false);
    expect(replay.run.status).toBe('RUNNING');
    expect(replay.run.executionToken).toBe('token-first');
    expect(replay.run.startedAt).toEqual(new Date('2026-09-29T13:00:00.000Z'));
  });

  it('reclaims a running research run after its lease expires', async () => {
    const story = await createTestStory('expired-lease');
    const repository = createResearchRunRepository(database);

    await repository.createPending({
      researchRunId: 'research-expired-lease',
      storyId: story.id,
      idempotencyKey: 'research:expired-lease:key',
      budget,
    });

    await repository.claim({
      researchRunId: 'research-expired-lease',
      executionToken: 'token-first',
      claimedAt: new Date('2026-09-29T13:00:00.000Z'),
      leaseExpiresAt: new Date('2026-09-29T13:05:00.000Z'),
    });

    const reclaimed = await repository.claim({
      researchRunId: 'research-expired-lease',
      executionToken: 'token-second',
      claimedAt: new Date('2026-09-29T13:06:00.000Z'),
      leaseExpiresAt: new Date('2026-09-29T13:11:00.000Z'),
    });

    expect(reclaimed.claimed).toBe(true);
    expect(reclaimed.run.executionToken).toBe('token-second');
    expect(reclaimed.run.leaseExpiresAt).toEqual(new Date('2026-09-29T13:11:00.000Z'));
    expect(reclaimed.run.startedAt).toEqual(new Date('2026-09-29T13:00:00.000Z'));
  });

  it('rejects a claim whose lease does not extend beyond claimedAt', async () => {
    const story = await createTestStory('invalid-lease');
    const repository = createResearchRunRepository(database);

    await repository.createPending({
      researchRunId: 'research-invalid-lease',
      storyId: story.id,
      idempotencyKey: 'research:invalid-lease:key',
      budget,
    });

    await expect(
      repository.claim({
        researchRunId: 'research-invalid-lease',
        executionToken: 'token-invalid',
        claimedAt: new Date('2026-09-29T13:00:00.000Z'),
        leaseExpiresAt: new Date('2026-09-29T13:00:00.000Z'),
      }),
    ).rejects.toThrow('Research execution lease must expire after it is claimed.');
  });

  it('completes a running research run', async () => {
    const story = await createTestStory('complete');
    const repository = createResearchRunRepository(database);

    await repository.createPending({
      researchRunId: 'research-complete',
      storyId: story.id,
      idempotencyKey: 'research:complete:key',
      budget,
    });

    await repository.claim({
      researchRunId: 'research-complete',
      executionToken: 'token-complete',
      claimedAt: new Date('2026-09-29T13:00:00.000Z'),
      leaseExpiresAt: new Date('2026-09-29T13:05:00.000Z'),
    });

    const completedAt = new Date('2026-09-29T13:01:00.000Z');

    const result = await repository.complete({
      researchRunId: 'research-complete',
      executionToken: 'token-complete',
      outcome: 'complete',
      stopReason: 'criteria-satisfied',
      selection: {
        sourceIds: ['source-1'],
        primarySourceCandidateIds: [],
        unresolvedQuestions: [],
        completionSuggestion: 'coverage-sufficient',
      },
      modelCalls: 2,
      toolCalls: 1,
      completedAt,
    });

    expect(result.updated).toBe(true);
    expect(result.run).toMatchObject({
      status: 'COMPLETED',
      outcome: 'COMPLETE',
      stopReason: 'CRITERIA_SATISFIED',
      modelCalls: 2,
      toolCalls: 1,
      executionToken: null,
      leaseExpiresAt: null,
      completedAt,
    });

    expect(result.run.selection).toEqual({
      sourceIds: ['source-1'],
      primarySourceCandidateIds: [],
      unresolvedQuestions: [],
      completionSuggestion: 'coverage-sufficient',
    });
  });

  it('replays identical completion idempotently', async () => {
    const story = await createTestStory('complete-replay');
    const repository = createResearchRunRepository(database);

    await repository.createPending({
      researchRunId: 'research-complete-replay',
      storyId: story.id,
      idempotencyKey: 'research:complete-replay:key',
      budget,
    });

    await repository.claim({
      researchRunId: 'research-complete-replay',
      executionToken: 'token-complete-replay',
      claimedAt: new Date('2026-09-29T13:00:00.000Z'),
      leaseExpiresAt: new Date('2026-09-29T13:05:00.000Z'),
    });

    const terminal = {
      researchRunId: 'research-complete-replay',
      executionToken: 'token-complete-replay',
      outcome: 'partial' as const,
      stopReason: 'deadline-exceeded' as const,
      selection: null,
      modelCalls: 3,
      toolCalls: 2,
      completedAt: new Date('2026-09-29T13:01:00.000Z'),
    };

    const first = await repository.complete(terminal);
    const second = await repository.complete({
      ...terminal,
      completedAt: new Date('2026-09-29T13:02:00.000Z'),
    });

    expect(first.updated).toBe(true);
    expect(second.updated).toBe(false);
    expect(second.run.completedAt).toEqual(terminal.completedAt);
  });

  it('rejects conflicting terminal completion replay', async () => {
    const story = await createTestStory('complete-conflict');
    const repository = createResearchRunRepository(database);

    await repository.createPending({
      researchRunId: 'research-complete-conflict',
      storyId: story.id,
      idempotencyKey: 'research:complete-conflict:key',
      budget,
    });

    await repository.claim({
      researchRunId: 'research-complete-conflict',
      executionToken: 'token-complete-conflict',
      claimedAt: new Date('2026-09-29T13:00:00.000Z'),
      leaseExpiresAt: new Date('2026-09-29T13:05:00.000Z'),
    });

    await repository.complete({
      researchRunId: 'research-complete-conflict',
      executionToken: 'token-complete-conflict',
      outcome: 'partial',
      stopReason: 'deadline-exceeded',
      selection: null,
      modelCalls: 2,
      toolCalls: 1,
      completedAt: new Date('2026-09-29T13:01:00.000Z'),
    });

    await expect(
      repository.complete({
        researchRunId: 'research-complete-conflict',
        executionToken: 'token-complete-conflict',
        outcome: 'complete',
        stopReason: 'criteria-satisfied',
        selection: {
          sourceIds: ['source-1'],
          primarySourceCandidateIds: [],
          unresolvedQuestions: [],
          completionSuggestion: 'coverage-sufficient',
        },
        modelCalls: 3,
        toolCalls: 1,
        completedAt: new Date('2026-09-29T13:02:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(ResearchPersistenceConflictError);
  });

  it('rejects completion from a stale execution token', async () => {
    const story = await createTestStory('stale-complete');
    const repository = createResearchRunRepository(database);

    await repository.createPending({
      researchRunId: 'research-stale-complete',
      storyId: story.id,
      idempotencyKey: 'research:stale-complete:key',
      budget,
    });

    await repository.claim({
      researchRunId: 'research-stale-complete',
      executionToken: 'token-first',
      claimedAt: new Date('2026-09-29T13:00:00.000Z'),
      leaseExpiresAt: new Date('2026-09-29T13:05:00.000Z'),
    });

    await repository.claim({
      researchRunId: 'research-stale-complete',
      executionToken: 'token-second',
      claimedAt: new Date('2026-09-29T13:06:00.000Z'),
      leaseExpiresAt: new Date('2026-09-29T13:11:00.000Z'),
    });

    await expect(
      repository.complete({
        researchRunId: 'research-stale-complete',
        executionToken: 'token-first',
        outcome: 'complete',
        stopReason: 'criteria-satisfied',
        selection: {
          sourceIds: ['source-1'],
          primarySourceCandidateIds: [],
          unresolvedQuestions: [],
          completionSuggestion: 'coverage-sufficient',
        },
        modelCalls: 2,
        toolCalls: 1,
        completedAt: new Date('2026-09-29T13:07:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(ResearchPersistenceConflictError);

    const persisted = await repository.findById('research-stale-complete');
    expect(persisted?.status).toBe('RUNNING');
    expect(persisted?.executionToken).toBe('token-second');
  });

  it('fails a running research run', async () => {
    const story = await createTestStory('failed');
    const repository = createResearchRunRepository(database);

    await repository.createPending({
      researchRunId: 'research-failed',
      storyId: story.id,
      idempotencyKey: 'research:failed:key',
      budget,
    });

    await repository.claim({
      researchRunId: 'research-failed',
      executionToken: 'token-failed',
      claimedAt: new Date('2026-09-29T13:00:00.000Z'),
      leaseExpiresAt: new Date('2026-09-29T13:05:00.000Z'),
    });

    const result = await repository.fail({
      researchRunId: 'research-failed',
      executionToken: 'token-failed',
      modelCalls: 1,
      toolCalls: 0,
      completedAt: new Date('2026-09-29T13:01:00.000Z'),
    });

    expect(result.updated).toBe(true);
    expect(result.run).toMatchObject({
      status: 'FAILED',
      outcome: 'FAILED',
      stopReason: 'TERMINAL_FAILURE',
      selection: null,
      modelCalls: 1,
      toolCalls: 0,
      executionToken: null,
      leaseExpiresAt: null,
    });
  });

  it('rejects failure from a stale execution token', async () => {
    const story = await createTestStory('stale-fail');
    const repository = createResearchRunRepository(database);

    await repository.createPending({
      researchRunId: 'research-stale-fail',
      storyId: story.id,
      idempotencyKey: 'research:stale-fail:key',
      budget,
    });

    await repository.claim({
      researchRunId: 'research-stale-fail',
      executionToken: 'token-first',
      claimedAt: new Date('2026-09-29T13:00:00.000Z'),
      leaseExpiresAt: new Date('2026-09-29T13:05:00.000Z'),
    });

    await repository.claim({
      researchRunId: 'research-stale-fail',
      executionToken: 'token-second',
      claimedAt: new Date('2026-09-29T13:06:00.000Z'),
      leaseExpiresAt: new Date('2026-09-29T13:11:00.000Z'),
    });

    await expect(
      repository.fail({
        researchRunId: 'research-stale-fail',
        executionToken: 'token-first',
        modelCalls: 1,
        toolCalls: 1,
        completedAt: new Date('2026-09-29T13:07:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(ResearchPersistenceConflictError);

    const persisted = await repository.findById('research-stale-fail');
    expect(persisted?.status).toBe('RUNNING');
    expect(persisted?.executionToken).toBe('token-second');
  });

  it('does not allow terminal transition directly from pending', async () => {
    const story = await createTestStory('pending-terminal');
    const repository = createResearchRunRepository(database);

    await repository.createPending({
      researchRunId: 'research-pending-terminal',
      storyId: story.id,
      idempotencyKey: 'research:pending-terminal:key',
      budget,
    });

    await expect(
      repository.fail({
        researchRunId: 'research-pending-terminal',
        executionToken: 'token-pending-terminal',
        modelCalls: 0,
        toolCalls: 0,
        completedAt: new Date('2026-09-29T13:01:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(ResearchPersistenceConflictError);
  });
});

async function createTestStory(suffix: string) {
  const articleRepository = createArticleRepository(database);

  const storyRepository = createStoryRepository(database);

  const article: NormalizedArticle = {
    title: `Research story ${suffix}`,

    url: `${testUrlPrefix}${suffix}`,

    canonicalUrl: `${testUrlPrefix}${suffix}`,

    source: {
      id: 'integration',

      name: 'Integration',

      type: 'api',
    },

    publisher: null,

    externalId: `external-${suffix}`,

    publishedAt: new Date('2026-09-29T12:00:00.000Z'),

    discoveredAt: new Date('2026-09-29T12:05:00.000Z'),

    author: null,

    summary: null,

    category: null,

    metadata: null,
  };

  const persisted = await articleRepository.persist(article);

  const storyId = `research-story-${suffix}` as StoryId;

  const created = await storyRepository.createSeedStory({
    storyId,

    seedArticleId: persisted.id as StoryArticleId,

    canonicalTitle: persisted.title,

    clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
  });

  return created.story;
}
