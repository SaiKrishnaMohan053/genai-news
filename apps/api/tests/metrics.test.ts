import { createMetricsRegistry, createNewsDiscoveryMetrics } from '@genai-news/observability';
import { describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';

describe('metrics route', () => {
  it('returns Prometheus metrics', async () => {
    const metricsRegistry = createMetricsRegistry({
      service: 'api',
      environment: 'test',
      collectDefaults: false,
    });

    const newsMetrics = createNewsDiscoveryMetrics(metricsRegistry);

    newsMetrics.discoveryEnqueueTotal.inc({
      source_id: 'gnews',
      status: 'accepted',
    });

    const app = buildApp({
      logger: false,
      metricsRegistry,
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/metrics',
      });

      expect(response.statusCode).toBe(200);

      expect(response.headers['content-type']).toContain('text/plain');

      expect(response.body).toContain('genai_news_discovery_enqueue_total');

      expect(response.body).toContain('source_id="gnews"');

      expect(response.body).toContain('status="accepted"');

      expect(response.body).toContain('service="api"');

      expect(response.body).toContain('environment="test"');
    } finally {
      await app.close();
    }
  });

  it('does not expose metrics when registry is unavailable', async () => {
    const app = buildApp({
      logger: false,
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/metrics',
      });

      expect(response.statusCode).toBe(404);

      expect(response.json()).toEqual({
        error: {
          code: 'NOT_FOUND',
          message: 'Route GET /metrics not found',
        },
      });
    } finally {
      await app.close();
    }
  });
});
