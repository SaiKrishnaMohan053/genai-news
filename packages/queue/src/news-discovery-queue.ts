import {
  jobIdSchema,
  newsDiscoveryJobSchema,
  type NewsDiscoveryJobPayload,
} from '@genai-news/schemas';
import { Queue } from 'bullmq';

import type { RedisClient } from './redis.js';

export const NEWS_DISCOVERY_QUEUE_NAME = 'news-discovery';
export const NEWS_DISCOVERY_JOB_NAME = 'news.discovery';

export type NewsDiscoveryQueue = Queue<NewsDiscoveryJobPayload>;

export function createNewsDiscoveryQueue(connection: RedisClient): NewsDiscoveryQueue {
  return new Queue<NewsDiscoveryJobPayload>(NEWS_DISCOVERY_QUEUE_NAME, {
    connection,
  });
}

export async function enqueueNewsDiscovery(
  queue: NewsDiscoveryQueue,
  payload: NewsDiscoveryJobPayload,
  jobId: string,
) {
  const validatedPayload = newsDiscoveryJobSchema.parse(payload);

  const validatedJobId = jobIdSchema.parse(jobId);

  return queue.add(NEWS_DISCOVERY_JOB_NAME, validatedPayload, {
    jobId: validatedJobId,

    attempts: 3,

    backoff: {
      type: 'exponential',
      delay: 1_000,
    },

    removeOnComplete: {
      age: 3_600,
      count: 1_000,
    },

    removeOnFail: {
      age: 86_400,
      count: 1_000,
    },
  });
}
