import { Redis } from 'ioredis';

export function createRedisClient(redisUrl: string): Redis {
  return new Redis(redisUrl, {
    lazyConnect: true,
    enableReadyCheck: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 2_000,
  });
}

export type RedisClient = Redis;
