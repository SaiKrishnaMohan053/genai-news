import { createTracing, type TracingSdk } from '@genai-news/observability';

import { loadEnv } from './config/env.js';

const env = loadEnv();

export const tracing: TracingSdk | null = env.OTEL_ENABLED
  ? createTracing({
      serviceName: 'genai-news-api',
      serviceVersion: '0.0.0',
      environment: env.NODE_ENV,
    })
  : null;

if (tracing) {
  tracing.start();
}
