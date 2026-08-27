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
