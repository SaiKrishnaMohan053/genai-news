import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createPrismaClient } from '@genai-news/database';
import { createNewsDiscoveryQueue, createRedisClient } from '@genai-news/queue';
import {
  createLogger,
  createMetricsRegistry,
  createNewsDiscoveryMetrics,
} from '@genai-news/observability';
import { tracing } from './instrumentation.js';

const env = loadEnv();
const logger = createLogger({
  service: 'api',
  environment: env.NODE_ENV,
  level: env.LOG_LEVEL,
});
const metricsRegistry = createMetricsRegistry({
  service: 'api',
  environment: env.NODE_ENV,
});

const newsDiscoveryMetrics = createNewsDiscoveryMetrics(metricsRegistry);
const database = createPrismaClient(env.DATABASE_URL);
const redis = createRedisClient(env.REDIS_URL);
const newsDiscoveryQueue = createNewsDiscoveryQueue(redis);

const app = buildApp({
  logger,
  database,
  redis,
  metricsRegistry,
  newsDiscoveryQueue,
  newsDiscoveryMetrics,
});

async function start(): Promise<void> {
  try {
    await app.listen({
      host: env.API_HOST,
      port: env.API_PORT,
    });

    app.log.info(
      {
        host: env.API_HOST,
        port: env.API_PORT,
        environment: env.NODE_ENV,
      },
      'api server started',
    );
  } catch (error) {
    app.log.fatal(
      {
        err: error,
      },
      'api server failed to start',
    );

    process.exitCode = 1;
  }
}

async function shutdown(signal: string): Promise<void> {
  app.log.info(
    {
      signal,
    },
    'api shutdown started',
  );

  try {
    await app.close();

    await newsDiscoveryQueue.close();

    await database.$disconnect();

    redis.disconnect();

    if (tracing) {
      await tracing.shutdown();
    }

    app.log.info('api shutdown completed');

    process.exit(0);
  } catch (error) {
    app.log.error(
      {
        err: error,
      },
      'api shutdown failed',
    );

    process.exit(1);
  }
}

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});

process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});

void start();
