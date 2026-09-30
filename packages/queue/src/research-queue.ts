import { jobIdSchema, researchJobSchema, type ResearchJobPayload } from '@genai-news/schemas';

import { Queue } from 'bullmq';

import type { RedisClient } from './redis.js';

export const RESEARCH_QUEUE_NAME = 'research';

export const RESEARCH_JOB_NAME = 'research.execute';

export type ResearchQueue = Queue<ResearchJobPayload>;

export function createResearchQueue(connection: RedisClient): ResearchQueue {
  return new Queue<ResearchJobPayload>(RESEARCH_QUEUE_NAME, {
    connection,
  });
}

export function createResearchJobId(researchRunId: string): string {
  const normalizedRunId = researchRunId.trim();

  if (normalizedRunId.length === 0) {
    throw new Error('Research run id must be non-empty.');
  }

  return jobIdSchema.parse(`research_${normalizedRunId}`);
}

export async function enqueueResearch(queue: ResearchQueue, payload: ResearchJobPayload) {
  const validatedPayload = researchJobSchema.parse(payload);

  const jobId = createResearchJobId(validatedPayload.researchRunId);

  return queue.add(RESEARCH_JOB_NAME, validatedPayload, {
    jobId,

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
