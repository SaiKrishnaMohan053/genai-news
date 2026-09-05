import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';

import type { DatabaseClient } from '@genai-news/database';
import type { AppMetricsRegistry, NewsDiscoveryMetrics } from '@genai-news/observability';
import type { NewsDiscoveryQueue, RedisClient } from '@genai-news/queue';

import { AppError } from './errors/app-error.js';
import { healthRoutes } from './routes/health.js';
import { metricsRoutes } from './routes/metrics.js';
import { newsArticleRoutes } from './routes/news-articles.js';
import { newsDiscoveryRoutes } from './routes/news-discovery.js';
import { newsStoryRoutes } from './routes/news-stories.js';

export interface BuildAppOptions {
  logger?: FastifyBaseLogger | false;

  database?: DatabaseClient;
  redis?: RedisClient;

  metricsRegistry?: AppMetricsRegistry;

  newsDiscoveryQueue?: NewsDiscoveryQueue;
  newsDiscoveryMetrics?: NewsDiscoveryMetrics;

  now?: () => Date;
  createJobId?: () => string;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app =
    options.logger === false
      ? Fastify({
          logger: false,
        })
      : options.logger
        ? Fastify({
            loggerInstance: options.logger,
          })
        : Fastify({
            logger: true,
          });

  app.register(healthRoutes, {
    ...(options.database ? { database: options.database } : {}),
    ...(options.redis ? { redis: options.redis } : {}),
  });

  if (options.metricsRegistry) {
    app.register(metricsRoutes, {
      metrics: options.metricsRegistry,
    });
  }

  app.register(newsArticleRoutes, {
    ...(options.database
      ? {
          database: options.database,
        }
      : {}),
  });

  app.register(newsStoryRoutes, {
    ...(options.database
      ? {
          database: options.database,
        }
      : {}),
  });

  app.register(newsDiscoveryRoutes, {
    ...(options.newsDiscoveryQueue
      ? {
          queue: options.newsDiscoveryQueue,
        }
      : {}),

    ...(options.newsDiscoveryMetrics
      ? {
          metrics: options.newsDiscoveryMetrics,
        }
      : {}),

    ...(options.now
      ? {
          now: options.now,
        }
      : {}),

    ...(options.createJobId
      ? {
          createJobId: options.createJobId,
        }
      : {}),
  });

  app.setNotFoundHandler(async (request, reply) => {
    return reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
      },
    });
  });

  app.setErrorHandler(async (error, request, reply) => {
    request.log.error(
      {
        err: error,
      },
      'request failed',
    );

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    return reply.status(500).send({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    });
  });

  return app;
}
