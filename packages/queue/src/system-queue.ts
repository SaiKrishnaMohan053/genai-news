import { jobIdSchema, systemPingJobSchema, type SystemPingJobPayload } from '@genai-news/schemas';
import { Queue } from 'bullmq';

import type { RedisClient } from './redis.js';

export const SYSTEM_QUEUE_NAME = 'system';
export const SYSTEM_PING_JOB_NAME = 'system.ping';

export function createSystemQueue(connection: RedisClient): Queue<SystemPingJobPayload> {
  return new Queue<SystemPingJobPayload>(SYSTEM_QUEUE_NAME, {
    connection,
  });
}

export async function enqueueSystemPing(
  queue: Queue<SystemPingJobPayload>,
  payload: SystemPingJobPayload,
  jobId: string,
) {
  const validatedPayload = systemPingJobSchema.parse(payload);

  const validatedJobId = jobIdSchema.parse(jobId);

  return queue.add(SYSTEM_PING_JOB_NAME, validatedPayload, {
    jobId: validatedJobId,
  });
}
