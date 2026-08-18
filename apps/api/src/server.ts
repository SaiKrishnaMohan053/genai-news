import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';

const env = loadEnv();

const app = buildApp({
  logger: {
    level: env.LOG_LEVEL,
  },
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
