import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

import { AppError } from './errors/app-error.js';
import { healthRoutes } from './routes/health.js';
import type { DatabaseClient } from '@genai-news/database';
import type { RedisClient } from '@genai-news/queue';

export interface BuildAppOptions {
  logger?: FastifyServerOptions['logger'];
  database?: DatabaseClient;
  redis?: RedisClient;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? true,
  });

  app.register(healthRoutes, {
    ...(options.database ? { database: options.database } : {}),
    ...(options.redis ? { redis: options.redis } : {}),
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
