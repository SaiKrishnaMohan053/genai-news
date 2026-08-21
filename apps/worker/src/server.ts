import { createLogger } from '@genai-news/observability';
import { createRedisClient, createWorkerRedisClient } from '@genai-news/queue';

import { loadWorkerEnv } from './config/env.js';
import { createSystemWorker } from './worker.js';
import { tracing } from './instrumentation.js';
import { createWorkerHealthServer } from './health/server.js';

const env = loadWorkerEnv();

const logger = createLogger({
  service: 'worker',
  environment: env.NODE_ENV,
  level: env.LOG_LEVEL,
});

const workerRedis = createWorkerRedisClient(env.REDIS_URL);

const healthRedis = createRedisClient(env.REDIS_URL);

const worker = createSystemWorker(workerRedis);

const healthServer = createWorkerHealthServer({
  redis: healthRedis,
});

healthServer.listen(env.WORKER_HEALTH_PORT, env.WORKER_HEALTH_HOST, () => {
  logger.info(
    {
      host: env.WORKER_HEALTH_HOST,
      port: env.WORKER_HEALTH_PORT,
    },
    'worker health server started',
  );
});

worker.on('ready', () => {
  logger.info('worker ready');
});

worker.on('completed', (job) => {
  logger.info(
    {
      jobId: job.id,
      jobName: job.name,
    },
    'job completed',
  );
});

worker.on('failed', (job, error) => {
  logger.error(
    {
      err: error,
      jobId: job?.id,
      jobName: job?.name,
    },
    'job failed',
  );
});

worker.on('error', (error) => {
  logger.error(
    {
      err: error,
    },
    'worker error',
  );
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  logger.info(
    {
      signal,
    },
    'worker shutdown started',
  );

  try {
    await worker.close();

    await new Promise<void>((resolve, reject) => {
      healthServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    healthRedis.disconnect();
    workerRedis.disconnect();

    if (tracing) {
      await tracing.shutdown();
    }

    logger.info('worker shutdown completed');

    process.exit(0);
  } catch (error) {
    logger.error(
      {
        err: error,
      },
      'worker shutdown failed',
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
