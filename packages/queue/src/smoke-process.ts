import {
  createRedisClient,
  createSystemQueue,
  enqueueSystemPing,
  SYSTEM_QUEUE_NAME,
} from './index.js';
import { QueueEvents } from 'bullmq';

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error('REDIS_URL is required for processing smoke test');
}

const redis = createRedisClient(redisUrl);
const queue = createSystemQueue(redis);

const queueEvents = new QueueEvents(SYSTEM_QUEUE_NAME, {
  connection: {
    url: redisUrl,
  },
});

const jobId = `phase0-8-${Date.now()}`;

try {
  await queueEvents.waitUntilReady();

  if (redis.status === 'wait') {
    await redis.connect();
  }

  const job = await enqueueSystemPing(
    queue,
    {
      message: 'phase 0.8 worker smoke test',
      requestedAt: new Date().toISOString(),
    },
    jobId,
  );

  const result = await job.waitUntilFinished(queueEvents, 10_000);

  process.stdout.write(
    `${JSON.stringify({
      status: 'completed',
      jobId: job.id,
      result,
    })}\n`,
  );

  await job.remove();
} finally {
  await queueEvents.close();
  await queue.close();
  redis.disconnect();
}
