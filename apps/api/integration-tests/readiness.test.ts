import { createPrismaClient, type DatabaseClient } from '@genai-news/database';
import { createRedisClient, type RedisClient } from '@genai-news/queue';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';

const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for API integration tests');
}

if (!redisUrl) {
  throw new Error('REDIS_URL is required for API integration tests');
}

describe('API readiness integration', () => {
  let database: DatabaseClient;
  let redis: RedisClient;

  beforeAll(() => {
    database = createPrismaClient(databaseUrl);
    redis = createRedisClient(redisUrl);
  });

  afterAll(async () => {
    await database.$disconnect();

    redis.disconnect();
  });

  it('reports real PostgreSQL and Redis as healthy', async () => {
    const app = buildApp({
      logger: false,
      database,
      redis,
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/health/ready',
      });

      expect(response.statusCode).toBe(200);

      expect(response.json()).toEqual({
        status: 'ready',
        service: 'api',
        dependencies: {
          database: 'healthy',
          redis: 'healthy',
        },
      });
    } finally {
      await app.close();
    }
  });
});
