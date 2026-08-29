import { randomUUID } from 'node:crypto';

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import {
  emitStructuredEvent,
  runWithSpan,
  type NewsDiscoveryMetrics,
} from '@genai-news/observability';
import {
  enqueueNewsDiscovery,
  NEWS_DISCOVERY_JOB_NAME,
  NEWS_DISCOVERY_QUEUE_NAME,
  type NewsDiscoveryQueue,
} from '@genai-news/queue';

import { AppError } from '../errors/app-error.js';

const discoveryRequestSchema = z.object({
  sourceId: z.literal('gnews'),
  limit: z.number().int().positive().max(100),
});

interface NewsDiscoveryRouteOptions {
  queue?: NewsDiscoveryQueue;
  metrics?: NewsDiscoveryMetrics;
  now?: () => Date;
  createJobId?: () => string;
}

export const newsDiscoveryRoutes: FastifyPluginAsync<NewsDiscoveryRouteOptions> = async (
  app,
  options,
) => {
  app.post('/api/news/discover', async (request, reply) => {
    const queue = options.queue;

    if (!queue) {
      throw new AppError(
        'News discovery queue is unavailable',
        503,
        'NEWS_DISCOVERY_UNAVAILABLE',
      );
    }

    const parsed = discoveryRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      throw new AppError(
        'Invalid news discovery request',
        400,
        'INVALID_DISCOVERY_REQUEST',
      );
    }

    const now = options.now ?? (() => new Date());
    const createJobId = options.createJobId ?? randomUUID;

    const requestedAt = now().toISOString();
    const jobId = createJobId();

    const enqueueStartedAt = performance.now();

    try {
      await runWithSpan(
        {
          tracerName: 'genai-news-api',
          spanName: 'news.discovery.enqueue',

          attributes: {
            'messaging.system': 'bullmq',
            'messaging.destination.name': NEWS_DISCOVERY_QUEUE_NAME,
            'messaging.operation.name': 'publish',
            'job.name': NEWS_DISCOVERY_JOB_NAME,
            'news.source.id': parsed.data.sourceId,
            'news.request.limit': parsed.data.limit,
          },
        },

        async (span) => {
          await enqueueNewsDiscovery(
            queue,
            {
              sourceId: parsed.data.sourceId,
              limit: parsed.data.limit,
              requestedAt,
            },
            jobId,
          );

          span.setAttribute('job.id', jobId);
        },
      );

      const enqueueDurationSeconds = (performance.now() - enqueueStartedAt) / 1000;

      options.metrics?.discoveryEnqueueTotal.inc({
        source_id: parsed.data.sourceId,
        status: 'accepted',
      });

      options.metrics?.discoveryEnqueueDurationSeconds.observe(
        {
          source_id: parsed.data.sourceId,
        },
        enqueueDurationSeconds,
      );

      emitStructuredEvent({
        logger: app.log,
        event: 'news.discovery.requested',

        attributes: {
          jobId,
          jobName: NEWS_DISCOVERY_JOB_NAME,
          sourceId: parsed.data.sourceId,
          limit: parsed.data.limit,
          requestedAt,
          enqueueDurationMs: enqueueDurationSeconds * 1000,
        },
      });
    } catch (error) {
      const enqueueDurationSeconds = (performance.now() - enqueueStartedAt) / 1000;

      options.metrics?.discoveryEnqueueTotal.inc({
        source_id: parsed.data.sourceId,
        status: 'failed',
      });

      options.metrics?.discoveryEnqueueDurationSeconds.observe(
        {
          source_id: parsed.data.sourceId,
        },
        enqueueDurationSeconds,
      );

      emitStructuredEvent({
        logger: app.log,
        event: 'news.discovery.enqueue_failed',
        level: 'error',

        attributes: {
          jobId,
          jobName: NEWS_DISCOVERY_JOB_NAME,
          sourceId: parsed.data.sourceId,
          limit: parsed.data.limit,
          requestedAt,
          enqueueDurationMs: enqueueDurationSeconds * 1000,
        },

        error,
      });

      throw error;
    }

    return reply.status(202).send({
      status: 'accepted',

      job: {
        id: jobId,
        name: NEWS_DISCOVERY_JOB_NAME,
      },
    });
  });
};