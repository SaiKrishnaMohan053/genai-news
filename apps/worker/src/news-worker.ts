import type { ArticleRepository } from '@genai-news/database';
import {
  NEWS_DISCOVERY_JOB_NAME,
  NEWS_DISCOVERY_QUEUE_NAME,
  type WorkerRedisClient,
} from '@genai-news/queue';
import type { FreshnessPolicy } from '@genai-news/shared';
import type { NewsDiscoveryJobPayload } from '@genai-news/schemas';
import { type Job, Worker } from 'bullmq';

import { runWithSpan } from '@genai-news/observability';

import { processNewsDiscovery, type NewsDiscoveryResult } from './jobs/news-discovery.js';
import type { NewsSourceRegistry } from './news/source-registry.js';

export type CreateNewsDiscoveryWorkerOptions = {
  connection: WorkerRedisClient;
  sourceRegistry: NewsSourceRegistry;
  articleRepository: ArticleRepository;
  freshnessPolicy: FreshnessPolicy;
  now?: () => Date;
};

export function createNewsDiscoveryWorker(options: CreateNewsDiscoveryWorkerOptions) {
  return new Worker<NewsDiscoveryJobPayload, NewsDiscoveryResult>(
    NEWS_DISCOVERY_QUEUE_NAME,

    async (job: Job<NewsDiscoveryJobPayload>): Promise<NewsDiscoveryResult> => {
      if (job.name !== NEWS_DISCOVERY_JOB_NAME) {
        throw new Error(`Unsupported job name: ${job.name}`);
      }

      return runWithSpan(
        {
          tracerName: 'genai-news-worker',
          spanName: `job ${job.name}`,

          attributes: {
            'messaging.system': 'bullmq',
            'messaging.destination.name': NEWS_DISCOVERY_QUEUE_NAME,
            'messaging.operation.name': 'process',
            'job.name': job.name,
            ...(job.id
              ? {
                  'job.id': job.id,
                }
              : {}),
          },
        },

        async () =>
          processNewsDiscovery(job.data, {
            sourceRegistry: options.sourceRegistry,
            articleRepository: options.articleRepository,
            freshnessPolicy: options.freshnessPolicy,
            ...(options.now
              ? {
                  now: options.now,
                }
              : {}),
          }),
      );
    },

    {
      connection: options.connection,
      concurrency: 2,
    },
  );
}
