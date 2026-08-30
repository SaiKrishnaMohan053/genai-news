import {
  createArticleRepository,
  createPrismaClient,
  type DatabaseClient,
} from '@genai-news/database';
import {
  createNewsDiscoveryQueue,
  createRedisClient,
  createWorkerRedisClient,
  enqueueNewsDiscovery,
  NEWS_DISCOVERY_QUEUE_NAME,
} from '@genai-news/queue';
import { GNewsError } from '@genai-news/tools';
import type { NewsSource, NewsSourceResult } from '@genai-news/shared';
import { QueueEvents } from 'bullmq';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createNewsDiscoveryWorker } from '../src/news-worker.js';
import type { NewsSourceRegistry } from '../src/news/source-registry.js';

const redisUrl = process.env.REDIS_URL;
const databaseUrl = process.env.DATABASE_URL;

if (!redisUrl) {
  throw new Error('REDIS_URL is required for worker integration tests');
}

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for worker integration tests');
}

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe('news discovery worker integration', () => {
  const producerRedis = createRedisClient(redisUrl);

  const workerRedis = createWorkerRedisClient(redisUrl);

  const queue = createNewsDiscoveryQueue(producerRedis);

  const queueEvents = new QueueEvents(NEWS_DISCOVERY_QUEUE_NAME, {
    connection: {
      url: redisUrl,
    },
  });

  let database: DatabaseClient;

  const fetchLatest = vi.fn<NewsSource['fetchLatest']>();

  const source: NewsSource = {
    id: 'gnews',
    name: 'GNews',
    type: 'api',

    fetchLatest,
  };

  const sourceRegistry: NewsSourceRegistry = {
    get(sourceId: string): NewsSource {
      if (sourceId !== 'gnews') {
        throw new Error(`Unsupported news source: ${sourceId}`);
      }

      return source;
    },
  };

  beforeAll(async () => {
    database = createPrismaClient(databaseUrl);

    await queueEvents.waitUntilReady();

    if (producerRedis.status === 'wait') {
      await producerRedis.connect();
    }
  });

  beforeEach(async () => {
    await database.article.deleteMany();

    await queue.drain(true);

    fetchLatest.mockReset();

    logger.info.mockReset();
    logger.warn.mockReset();
    logger.error.mockReset();
  });

  afterAll(async () => {
    await database.article.deleteMany();

    await queueEvents.close();
    await queue.close();

    producerRedis.disconnect();
    workerRedis.disconnect();

    await database.$disconnect();
  });

  it('processes a discovery job end to end and persists articles', async () => {
    fetchLatest.mockResolvedValue(createSourceResult());

    const articleRepository = createArticleRepository(database);

    const worker = createNewsDiscoveryWorker({
      connection: workerRedis,
      sourceRegistry,
      articleRepository,

      freshnessPolicy: {
        maxAgeMs: 24 * 60 * 60 * 1000,
        maxFutureSkewMs: 5 * 60 * 1000,
        missingPublishedAt: 'reject',
      },

      now: () => new Date('2026-08-27T16:00:00.000Z'),
    });

    try {
      await worker.waitUntilReady();

      const jobId = `news-integration-${Date.now()}`;

      const job = await enqueueNewsDiscovery(
        queue,
        {
          sourceId: 'gnews',
          limit: 10,
          requestedAt: '2026-08-27T15:58:00.000Z',
        },
        jobId,
      );

      const result = await job.waitUntilFinished(queueEvents, 10_000);

      expect(result).toMatchObject({
        sourceId: 'gnews',

        fetchedCount: 3,

        normalizedCount: 3,
        normalizationRejectedCount: 0,

        freshCount: 2,
        freshnessRejectedCount: 1,

        uniqueCount: 1,
        duplicateCount: 1,

        persistedCount: 1,
      });

      expect(await database.article.count()).toBe(1);

      const persisted = await database.article.findUnique({
        where: {
          canonicalUrl: 'https://example.com/fresh',
        },
      });

      expect(persisted).not.toBeNull();

      expect(persisted?.title).toBe('Fresh article');

      expect(persisted?.sourceId).toBe('gnews');

      await job.remove();
    } finally {
      await worker.close();
    }
  });

  it('remains idempotent when the same discovery job content is processed again', async () => {
    fetchLatest.mockResolvedValue(createSourceResult());

    const articleRepository = createArticleRepository(database);

    const worker = createNewsDiscoveryWorker({
      connection: workerRedis,
      sourceRegistry,
      articleRepository,

      freshnessPolicy: {
        maxAgeMs: 24 * 60 * 60 * 1000,
        maxFutureSkewMs: 5 * 60 * 1000,
        missingPublishedAt: 'reject',
      },

      now: () => new Date('2026-08-27T16:00:00.000Z'),
    });

    try {
      await worker.waitUntilReady();

      const first = await enqueueNewsDiscovery(
        queue,
        {
          sourceId: 'gnews',
          limit: 10,
          requestedAt: '2026-08-27T15:58:00.000Z',
        },
        `news-first-${Date.now()}`,
      );

      await first.waitUntilFinished(queueEvents, 10_000);

      const second = await enqueueNewsDiscovery(
        queue,
        {
          sourceId: 'gnews',
          limit: 10,
          requestedAt: '2026-08-27T15:59:00.000Z',
        },
        `news-second-${Date.now()}`,
      );

      await second.waitUntilFinished(queueEvents, 10_000);

      expect(await database.article.count()).toBe(1);

      expect(fetchLatest).toHaveBeenCalledTimes(2);

      await first.remove();
      await second.remove();
    } finally {
      await worker.close();
    }
  });

  it('retries a transient source failure and succeeds after recovery', async () => {
    fetchLatest
      .mockRejectedValueOnce(
        new GNewsError({
          kind: 'network',
          message: 'Temporary GNews network failure.',
        }),
      )
      .mockRejectedValueOnce(
        new GNewsError({
          kind: 'network',
          message: 'Temporary GNews network failure.',
        }),
      )
      .mockResolvedValueOnce(createSourceResult());

    const articleRepository = createArticleRepository(database);

    const worker = createNewsDiscoveryWorker({
      connection: workerRedis,
      sourceRegistry,
      articleRepository,

      freshnessPolicy: {
        maxAgeMs: 24 * 60 * 60 * 1000,
        maxFutureSkewMs: 5 * 60 * 1000,
        missingPublishedAt: 'reject',
      },

      now: () => new Date('2026-08-27T16:00:00.000Z'),
    });

    try {
      await worker.waitUntilReady();

      const job = await enqueueNewsDiscovery(
        queue,
        {
          sourceId: 'gnews',
          limit: 10,
          requestedAt: '2026-08-27T15:58:00.000Z',
        },
        `news-retry-recovery-${Date.now()}`,
      );

      const result = await job.waitUntilFinished(
        queueEvents,
        15_000,
      );

      expect(result).toMatchObject({
        sourceId: 'gnews',
        persistedCount: 1,
      });

      expect(fetchLatest).toHaveBeenCalledTimes(3);

      expect(await job.getState()).toBe('completed');

      expect(await database.article.count()).toBe(1);

      await job.remove();
    } finally {
      await worker.close();
    }
  });

  it('does not retry an invalid provider payload', async () => {
    fetchLatest.mockRejectedValue(
      new GNewsError({
        kind: 'invalid-response',
        message: 'GNews returned an invalid response.',
      }),
    );

    const articleRepository = createArticleRepository(database);

    const worker = createNewsDiscoveryWorker({
      connection: workerRedis,
      sourceRegistry,
      articleRepository,

      freshnessPolicy: {
        maxAgeMs: 24 * 60 * 60 * 1000,
        maxFutureSkewMs: 5 * 60 * 1000,
        missingPublishedAt: 'reject',
      },

      now: () => new Date('2026-08-27T16:00:00.000Z'),
    });

    try {
      await worker.waitUntilReady();

      const job = await enqueueNewsDiscovery(
        queue,
        {
          sourceId: 'gnews',
          limit: 10,
          requestedAt: '2026-08-27T15:58:00.000Z',
        },
        `news-invalid-response-${Date.now()}`,
      );

      await expect(
        job.waitUntilFinished(queueEvents, 10_000),
      ).rejects.toThrow(
        'GNews returned an invalid response.',
      );

      expect(fetchLatest).toHaveBeenCalledTimes(1);

      expect(await job.getState()).toBe('failed');

      expect(await database.article.count()).toBe(0);

      await job.remove();
    } finally {
      await worker.close();
    }
  });

  it('does not retry a terminal source HTTP failure', async () => {
    fetchLatest.mockRejectedValue(
      new GNewsError({
        kind: 'http',
        statusCode: 401,
        message: 'GNews request failed with HTTP 401.',
      }),
    );

    const articleRepository = createArticleRepository(database);

    const worker = createNewsDiscoveryWorker({
      connection: workerRedis,
      sourceRegistry,
      articleRepository,

      freshnessPolicy: {
        maxAgeMs: 24 * 60 * 60 * 1000,
        maxFutureSkewMs: 5 * 60 * 1000,
        missingPublishedAt: 'reject',
      },

      now: () => new Date('2026-08-27T16:00:00.000Z'),
    });

    try {
      await worker.waitUntilReady();

      const job = await enqueueNewsDiscovery(
        queue,
        {
          sourceId: 'gnews',
          limit: 10,
          requestedAt: '2026-08-27T15:58:00.000Z',
        },
        `news-http-terminal-${Date.now()}`,
      );

      await expect(
        job.waitUntilFinished(queueEvents, 10_000),
      ).rejects.toThrow(
        'GNews request failed with HTTP 401.',
      );

      expect(fetchLatest).toHaveBeenCalledTimes(1);

      expect(await job.getState()).toBe('failed');

      expect(await database.article.count()).toBe(0);

      await job.remove();
    } finally {
      await worker.close();
    }
  });

  it('recovers from a transient persistence failure without duplicate rows', async () => {
    fetchLatest.mockResolvedValue(createSourceResult());

    const realRepository = createArticleRepository(database);

    let persistAttempts = 0;

    const failingRepository = {
      ...realRepository,

      async persist(...args: Parameters<typeof realRepository.persist>) {
        persistAttempts += 1;

        if (persistAttempts <= 2) {
          throw new Error('Temporary database persistence failure.');
        }

        return realRepository.persist(...args);
      },
    };

    const worker = createNewsDiscoveryWorker({
      connection: workerRedis,
      sourceRegistry,
      articleRepository: failingRepository,

      freshnessPolicy: {
        maxAgeMs: 24 * 60 * 60 * 1000,
        maxFutureSkewMs: 5 * 60 * 1000,
        missingPublishedAt: 'reject',
      },

      now: () => new Date('2026-08-27T16:00:00.000Z'),
    });

    try {
      await worker.waitUntilReady();

      const job = await enqueueNewsDiscovery(
        queue,
        {
          sourceId: 'gnews',
          limit: 10,
          requestedAt: '2026-08-27T15:58:00.000Z',
        },
        `news-persistence-recovery-${Date.now()}`,
      );

      const result = await job.waitUntilFinished(
        queueEvents,
        15_000,
      );

      expect(result).toMatchObject({
        sourceId: 'gnews',
        persistedCount: 1,
      });

      expect(persistAttempts).toBe(3);

      expect(fetchLatest).toHaveBeenCalledTimes(3);

      expect(await database.article.count()).toBe(1);

      expect(await job.getState()).toBe('completed');

      await job.remove();
    } finally {
      await worker.close();
    }
  });

  it('remains idempotent when a retry follows partial persistence', async () => {
    fetchLatest.mockResolvedValue(
      createTwoUniqueSourceResult(),
    );

    const realRepository =
      createArticleRepository(database);

    let persistCalls = 0;

    const partiallyFailingRepository = {
      ...realRepository,

      async persist(
        ...args: Parameters<
          typeof realRepository.persist
        >
      ) {
        persistCalls += 1;

        if (persistCalls === 2) {
          throw new Error(
            'Temporary failure after partial persistence.',
          );
        }

        return realRepository.persist(...args);
      },
    };

    const worker = createNewsDiscoveryWorker({
      connection: workerRedis,
      sourceRegistry,

      articleRepository:
        partiallyFailingRepository,

      freshnessPolicy: {
        maxAgeMs: 24 * 60 * 60 * 1000,
        maxFutureSkewMs: 5 * 60 * 1000,
        missingPublishedAt: 'reject',
      },

      now: () =>
        new Date('2026-08-27T16:00:00.000Z'),
    });

    try {
      await worker.waitUntilReady();

      const job = await enqueueNewsDiscovery(
        queue,
        {
          sourceId: 'gnews',
          limit: 10,
          requestedAt:
            '2026-08-27T15:58:00.000Z',
        },
        `news-partial-persistence-${Date.now()}`,
      );

      const result =
        await job.waitUntilFinished(
          queueEvents,
          15_000,
        );

      expect(result).toMatchObject({
        sourceId: 'gnews',
        fetchedCount: 2,
        uniqueCount: 2,
        persistedCount: 2,
      });

      expect(fetchLatest).toHaveBeenCalledTimes(2);

      expect(persistCalls).toBe(4);

      expect(
        await database.article.count(),
      ).toBe(2);

      expect(
        await database.article.findUnique({
          where: {
            canonicalUrl:
              'https://example.com/partial-a',
          },
        }),
      ).not.toBeNull();

      expect(
        await database.article.findUnique({
          where: {
            canonicalUrl:
              'https://example.com/partial-b',
          },
        }),
      ).not.toBeNull();

      expect(
        await job.getState(),
      ).toBe('completed');

      await job.remove();
    } finally {
      await worker.close();
    }
  });
});

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
        externalId: 'fresh-1',

        title: 'Fresh article',

        url: 'https://example.com/fresh',

        publishedAt: '2026-08-27T15:00:00.000Z',

        publisher: {
          name: 'Example Publisher',
        },
      },

      {
        externalId: 'fresh-2',

        title: 'Fresh article',

        url: 'https://example.com/fresh?utm_source=test',

        publishedAt: '2026-08-27T15:00:00.000Z',

        publisher: {
          name: 'Example Publisher',
        },
      },

      {
        externalId: 'stale-1',

        title: 'Old article',

        url: 'https://example.com/old',

        publishedAt: '2026-08-20T15:00:00.000Z',

        publisher: {
          name: 'Example Publisher',
        },
      },
    ],
  };
}

function createTwoUniqueSourceResult(): NewsSourceResult {
  return {
    source: {
      id: 'gnews',
      name: 'GNews',
      type: 'api',
    },

    fetchedAt: new Date('2026-08-27T15:59:00.000Z'),

    articles: [
      {
        externalId: 'partial-a',

        title: 'Partial article A',

        url: 'https://example.com/partial-a',

        publishedAt: '2026-08-27T15:00:00.000Z',

        publisher: {
          name: 'Example Publisher',
        },
      },

      {
        externalId: 'partial-b',

        title: 'Partial article B',

        url: 'https://example.com/partial-b',

        publishedAt: '2026-08-27T15:01:00.000Z',

        publisher: {
          name: 'Example Publisher',
        },
      },
    ],
  };
}