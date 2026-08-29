import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWorkerHealthServer } from '../src/health/server.js';
import { createMetricsRegistry, createNewsDiscoveryMetrics } from '@genai-news/observability';

describe('worker health server', () => {
  const servers: ReturnType<typeof createWorkerHealthServer>[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          }),
      ),
    );

    servers.length = 0;
  });

  async function startServer(
    redis: unknown,
    metrics?: Parameters<typeof createWorkerHealthServer>[0]['metrics'],
  ): Promise<string> {
    const server = createWorkerHealthServer({
      redis: redis as never,

      ...(metrics
        ? {
            metrics,
          }
        : {}),
    });

    servers.push(server);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });

    const address = server.address() as AddressInfo;

    return `http://127.0.0.1:${address.port}`;
  }

  it('returns 404 for metrics when registry is unavailable', async () => {
    const baseUrl = await startServer({
      status: 'ready',
      ping: vi.fn(),
    });

    const response = await fetch(`${baseUrl}/metrics`);

    expect(response.status).toBe(404);

    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Route GET /metrics not found',
      },
    });
  });

  it('returns worker Prometheus metrics', async () => {
    const metricsRegistry = createMetricsRegistry({
      service: 'worker',
      environment: 'test',
      collectDefaults: false,
    });

    const newsMetrics = createNewsDiscoveryMetrics(metricsRegistry);

    newsMetrics.jobsTotal.inc({
      source_id: 'gnews',
      status: 'completed',
    });

    newsMetrics.articlesPersistedTotal.inc(
      {
        source_id: 'gnews',
      },
      3,
    );

    const baseUrl = await startServer(
      {
        status: 'ready',
        ping: vi.fn(),
      },
      metricsRegistry,
    );

    const response = await fetch(`${baseUrl}/metrics`);

    expect(response.status).toBe(200);

    expect(response.headers.get('content-type')).toContain('text/plain');

    const output = await response.text();

    expect(output).toContain('genai_news_discovery_jobs_total');

    expect(output).toContain('status="completed"');

    expect(output).toContain('genai_news_articles_persisted_total');

    expect(output).toContain('source_id="gnews"');

    expect(output).toContain('service="worker"');

    expect(output).toContain('environment="test"');
  });

  it('returns worker liveness', async () => {
    const baseUrl = await startServer({
      status: 'ready',
      ping: vi.fn(),
    });

    const response = await fetch(`${baseUrl}/health/live`);

    expect(response.status).toBe(200);

    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      service: 'worker',
    });
  });

  it('returns readiness when Redis is healthy', async () => {
    const baseUrl = await startServer({
      status: 'ready',
      ping: vi.fn().mockResolvedValue('PONG'),
    });

    const response = await fetch(`${baseUrl}/health/ready`);

    expect(response.status).toBe(200);

    await expect(response.json()).resolves.toEqual({
      status: 'ready',
      service: 'worker',
      dependencies: {
        redis: 'healthy',
      },
    });
  });

  it('returns 503 when Redis is unhealthy', async () => {
    const baseUrl = await startServer({
      status: 'ready',
      ping: vi.fn().mockRejectedValue(new Error('redis unavailable')),
    });

    const response = await fetch(`${baseUrl}/health/ready`);

    expect(response.status).toBe(503);

    await expect(response.json()).resolves.toEqual({
      status: 'not_ready',
      service: 'worker',
      dependencies: {
        redis: 'unhealthy',
      },
    });
  });
});
