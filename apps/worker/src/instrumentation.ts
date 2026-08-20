import { createTracing, type TracingSdk } from '@genai-news/observability';

import { loadWorkerEnv } from './config/env.js';

const env = loadWorkerEnv();

export const tracing: TracingSdk | null = env.OTEL_ENABLED
  ? createTracing({
      serviceName: 'genai-news-worker',
      serviceVersion: '0.0.0',
      environment: env.NODE_ENV,
    })
  : null;

if (tracing) {
  tracing.start();
}
