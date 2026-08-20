import type { RedisClient } from './redis.js';

export async function checkRedisHealth(client: RedisClient): Promise<boolean> {
  try {
    if (client.status === 'wait') {
      await client.connect();
    }

    const result = await client.ping();

    return result === 'PONG';
  } catch {
    return false;
  }
}
