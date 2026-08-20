import { SYSTEM_PING_JOB_NAME, SYSTEM_QUEUE_NAME, type WorkerRedisClient } from '@genai-news/queue';
import { type SystemPingJobPayload } from '@genai-news/schemas';
import { type Job, Worker } from 'bullmq';
import { runWithSpan } from '@genai-news/observability';
import { processSystemPing, type SystemPingResult } from './jobs/system-ping.js';

export function createSystemWorker(connection: WorkerRedisClient) {
  return new Worker<SystemPingJobPayload, SystemPingResult>(
    SYSTEM_QUEUE_NAME,
    async (job: Job<SystemPingJobPayload>): Promise<SystemPingResult> => {
      if (job.name !== SYSTEM_PING_JOB_NAME) {
        throw new Error(`Unsupported job name: ${job.name}`);
      }

      return runWithSpan(
        {
          tracerName: 'genai-news-worker',
          spanName: `job ${job.name}`,
          attributes: {
            'messaging.system': 'bullmq',
            'messaging.destination.name': SYSTEM_QUEUE_NAME,
            'messaging.operation.name': 'process',
            'job.name': job.name,
            ...(job.id ? { 'job.id': job.id } : {}),
          },
        },
        async () => processSystemPing(job.data),
      );
    },
    {
      connection,
      concurrency: 1,
    },
  );
}
