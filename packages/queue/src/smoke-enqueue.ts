import {
  createRedisClient,
  createSystemQueue,
  enqueueSystemPing,
  SYSTEM_QUEUE_NAME,
} from './index.js';

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error('REDIS_URL is required for queue smoke test');
}

const redis = createRedisClient(redisUrl);
const queue = createSystemQueue(redis);

const jobId = 'phase0-7-smoke';

try {
  if (redis.status === 'wait') {
    await redis.connect();
  }

  const job = await enqueueSystemPing(
    queue,
    {
      message: 'phase 0.7 queue smoke test',
      requestedAt: new Date().toISOString(),
    },
    jobId,
  );

  const storedJob = await queue.getJob(jobId);

  if (!storedJob) {
    throw new Error(`Queue smoke test failed: ${jobId} was not found`);
  }

  process.stdout.write(
    `${JSON.stringify({
      status: 'enqueued',
      queue: SYSTEM_QUEUE_NAME,
      jobName: storedJob.name,
      jobId: storedJob.id,
    })}\n`,
  );

  await storedJob.remove();
} finally {
  await queue.close();
  redis.disconnect();
}
