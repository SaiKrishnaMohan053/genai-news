import {
  createRedisClient,
  createSystemQueue,
  createWorkerRedisClient,
  enqueueSystemPing,
  SYSTEM_QUEUE_NAME,
} from '@genai-news/queue';
import { QueueEvents } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createSystemWorker } from '../src/worker.js';

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error('REDIS_URL is required for worker integration tests');
}

describe('system worker integration', () => {
  const producerRedis = createRedisClient(redisUrl);

  const workerRedis = createWorkerRedisClient(redisUrl);

  const queue = createSystemQueue(producerRedis);

  const queueEvents = new QueueEvents(SYSTEM_QUEUE_NAME, {
    connection: {
      url: redisUrl,
    },
  });

  const worker = createSystemWorker(workerRedis);

  beforeAll(async () => {
    await queueEvents.waitUntilReady();

    if (producerRedis.status === 'wait') {
      await producerRedis.connect();
    }

    await worker.waitUntilReady();
  });

  afterAll(async () => {
    await worker.close();
    await queueEvents.close();
    await queue.close();

    producerRedis.disconnect();
    workerRedis.disconnect();
  });

  it('processes a system ping job end to end', async () => {
    const jobId = `integration-${Date.now()}`;

    const job = await enqueueSystemPing(
      queue,
      {
        message: 'worker integration test',
        requestedAt: new Date().toISOString(),
      },
      jobId,
    );

    const result = await job.waitUntilFinished(queueEvents, 10_000);

    expect(result).toMatchObject({
      processed: true,
      message: 'worker integration test',
    });

    expect(Number.isNaN(Date.parse(result.processedAt))).toBe(false);

    await job.remove();
  });
});
