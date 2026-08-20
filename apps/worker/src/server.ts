import { createWorkerRedisClient } from '@genai-news/queue';

import { loadWorkerEnv } from './config/env.js';
import { createSystemWorker } from './worker.js';

const env = loadWorkerEnv();

const redis = createWorkerRedisClient(env.REDIS_URL);

const worker = createSystemWorker(redis);

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message || 'Unknown error',
      stack: error.stack,
    };
  }

  return {
    name: 'UnknownError',
    message: String(error),
  };
}

worker.on('ready', () => {
  process.stdout.write(
    `${JSON.stringify({
      level: 'info',
      service: 'worker',
      message: 'worker ready',
    })}\n`,
  );
});

worker.on('completed', (job) => {
  process.stdout.write(
    `${JSON.stringify({
      level: 'info',
      service: 'worker',
      message: 'job completed',
      jobId: job.id,
      jobName: job.name,
    })}\n`,
  );
});

worker.on('failed', (job, error) => {
  process.stderr.write(
    `${JSON.stringify({
      level: 'error',
      service: 'worker',
      message: 'job failed',
      jobId: job?.id,
      jobName: job?.name,
      error: serializeError(error),
    })}\n`,
  );
});

worker.on('error', (error) => {
  process.stderr.write(
    `${JSON.stringify({
      level: 'error',
      service: 'worker',
      message: 'worker error',
      error: serializeError(error),
    })}\n`,
  );
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  process.stdout.write(
    `${JSON.stringify({
      level: 'info',
      service: 'worker',
      message: 'worker shutdown started',
      signal,
    })}\n`,
  );

  try {
    await worker.close();
    redis.disconnect();

    process.stdout.write(
      `${JSON.stringify({
        level: 'info',
        service: 'worker',
        message: 'worker shutdown completed',
      })}\n`,
    );

    process.exit(0);
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        level: 'error',
        service: 'worker',
        message: 'worker shutdown failed',
        error: error instanceof Error ? error.message : String(error),
      })}\n`,
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
