import {
  createNewsDiscoveryQueue,
  createRedisClient,
  NEWS_DISCOVERY_JOB_NAME,
  type RedisClient,
} from '@genai-news/queue';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error('REDIS_URL is required for API integration tests');
}

describe('news discovery API integration', () => {
  let redis: RedisClient;

  beforeAll(async () => {
    redis = createRedisClient(redisUrl);

    if (redis.status === 'wait') {
      await redis.connect();
    }
  });

  afterAll(() => {
    redis.disconnect();
  });

  it('enqueues a real discovery job in Redis', async () => {
    const queue = createNewsDiscoveryQueue(redis);

    const app = buildApp({
      logger: false,

      newsDiscoveryQueue: queue,

      now: () => new Date('2026-08-27T16:00:00.000Z'),

      createJobId: () => 'api-discovery-integration',
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/news/discover',

        payload: {
          sourceId: 'gnews',
          limit: 25,
        },
      });

      expect(response.statusCode).toBe(202);

      expect(response.json()).toEqual({
        status: 'accepted',
        job: {
          id: 'api-discovery-integration',
          name: NEWS_DISCOVERY_JOB_NAME,
        },
      });

      const job = await queue.getJob('api-discovery-integration');

      expect(job).not.toBeNull();

      expect(job?.name).toBe(NEWS_DISCOVERY_JOB_NAME);

      expect(job?.data).toEqual({
        sourceId: 'gnews',
        limit: 25,
        requestedAt: '2026-08-27T16:00:00.000Z',
      });

      await job?.remove();
    } finally {
      await app.close();
      await queue.close();
    }
  });
});
