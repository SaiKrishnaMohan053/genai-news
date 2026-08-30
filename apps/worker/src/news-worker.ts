import type { ArticleRepository } from '@genai-news/database';
import {
  emitStructuredEvent,
  runWithSpan,
  type NewsDiscoveryMetrics,
  type StructuredEventLogger,
} from '@genai-news/observability';
import {
  NEWS_DISCOVERY_JOB_NAME,
  NEWS_DISCOVERY_QUEUE_NAME,
  type WorkerRedisClient,
} from '@genai-news/queue';
import type { NewsDiscoveryJobPayload } from '@genai-news/schemas';
import type { FreshnessPolicy } from '@genai-news/shared';
import { type Job, UnrecoverableError, Worker } from 'bullmq';

import { processNewsDiscovery, type NewsDiscoveryResult } from './jobs/news-discovery.js';
import { classifyDiscoveryFailure } from './news/discovery-error-classifier.js';
import { annotateDiscoveryFailureSpan } from './news/discovery-failure-observability.js';
import type { NewsSourceRegistry } from './news/source-registry.js';

export type CreateNewsDiscoveryWorkerOptions = {
  connection: WorkerRedisClient;
  sourceRegistry: NewsSourceRegistry;
  articleRepository: ArticleRepository;
  freshnessPolicy: FreshnessPolicy;
  metrics?: NewsDiscoveryMetrics;
  logger?: StructuredEventLogger;
  now?: () => Date;
};

export function createNewsDiscoveryWorker(options: CreateNewsDiscoveryWorkerOptions) {
  return new Worker<NewsDiscoveryJobPayload, NewsDiscoveryResult>(
    NEWS_DISCOVERY_QUEUE_NAME,

    async (job: Job<NewsDiscoveryJobPayload>): Promise<NewsDiscoveryResult> => {
      if (job.name !== NEWS_DISCOVERY_JOB_NAME) {
        throw new Error(`Unsupported job name: ${job.name}`);
      }

      const sourceId = job.data.sourceId;
      const discoveryStartedAt = performance.now();

      try {
        const result = await runWithSpan(
          {
            tracerName: 'genai-news-worker',
            spanName: `job ${job.name}`,

            attributes: {
              'messaging.system': 'bullmq',
              'messaging.destination.name': NEWS_DISCOVERY_QUEUE_NAME,
              'messaging.operation.name': 'process',
              'job.name': job.name,
              'news.source.id': sourceId,

              ...(job.id
                ? {
                    'job.id': job.id,
                  }
                : {}),
            },
          },

          async (span) => {
            try {
              const discoveryResult = await processNewsDiscovery(job.data, {
                sourceRegistry: options.sourceRegistry,

                articleRepository: options.articleRepository,

                freshnessPolicy: options.freshnessPolicy,

                ...(options.metrics
                  ? {
                      metrics: options.metrics,
                    }
                  : {}),

                ...(options.now
                  ? {
                      now: options.now,
                    }
                  : {}),
              });

              span.setAttribute('news.fetched_count', discoveryResult.fetchedCount);

              span.setAttribute('news.normalized_count', discoveryResult.normalizedCount);

              span.setAttribute('news.fresh_count', discoveryResult.freshCount);

              span.setAttribute('news.unique_count', discoveryResult.uniqueCount);

              span.setAttribute('news.persisted_count', discoveryResult.persistedCount);

              return discoveryResult;
            } catch (error) {
              const classification = classifyDiscoveryFailure(error);

              annotateDiscoveryFailureSpan(span, classification);

              throw error;
            }
          },
        );

        const discoveryDurationSeconds = (performance.now() - discoveryStartedAt) / 1000;

        options.metrics?.jobsTotal.inc({
          source_id: sourceId,
          status: 'completed',
        });

        options.metrics?.discoveryDurationSeconds.observe(
          {
            source_id: sourceId,
          },
          discoveryDurationSeconds,
        );

        return result;
      } catch (error) {
        const discoveryDurationSeconds = (performance.now() - discoveryStartedAt) / 1000;

        options.metrics?.jobsTotal.inc({
          source_id: sourceId,
          status: 'failed',
        });

        options.metrics?.discoveryDurationSeconds.observe(
          {
            source_id: sourceId,
          },
          discoveryDurationSeconds,
        );

        const classification = classifyDiscoveryFailure(error);

        if (options.logger) {
          emitStructuredEvent({
            logger: options.logger,
            event: 'news.discovery.failed',
            level: 'error',

            attributes: {
              sourceId,
              failureReason: classification.reason,
              retryable: classification.retryable,

              ...(job.id
                ? {
                    jobId: job.id,
                  }
                : {}),
            },

            error,
          });
        }

        if (!classification.retryable) {
          throw new UnrecoverableError(
            error instanceof Error ? error.message : 'Unrecoverable news discovery failure.',
          );
        }

        throw error;
      }
    },

    {
      connection: options.connection,
      concurrency: 2,
    },
  );
}
