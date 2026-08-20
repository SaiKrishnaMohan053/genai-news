import { Redis } from 'ioredis';

export function createWorkerRedisClient(redisUrl: string): Redis {
  return new Redis(redisUrl, {
    enableReadyCheck: true,
    maxRetriesPerRequest: null,
    connectTimeout: 2_000,
  });
}

export type WorkerRedisClient = Redis;
