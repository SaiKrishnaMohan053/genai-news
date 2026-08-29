import { describe, expect, it } from 'vitest';

import { createMetricsRegistry, createNewsDiscoveryMetrics } from '../src/index.js';

describe('metrics', () => {
  it('adds service metadata and records counters', async () => {
    const registry = createMetricsRegistry({
      service: 'test-service',
      environment: 'test',
      collectDefaults: false,
    });

    const metrics = createNewsDiscoveryMetrics(registry);

    metrics.articlesFetchedTotal.inc(
      {
        source_id: 'gnews',
      },
      10,
    );

    const output = await registry.metrics();

    expect(output).toContain('genai_news_articles_fetched_total');

    expect(output).toContain('source_id="gnews"');

    expect(output).toContain('service="test-service"');

    expect(output).toContain('environment="test"');
  });

  it('records discovery status without job identifiers', async () => {
    const registry = createMetricsRegistry({
      service: 'worker',
      environment: 'test',
      collectDefaults: false,
    });

    const metrics = createNewsDiscoveryMetrics(registry);

    metrics.jobsTotal.inc({
      source_id: 'gnews',
      status: 'completed',
    });

    const output = await registry.metrics();

    expect(output).toContain('status="completed"');

    expect(output).not.toContain('job_id');
    expect(output).not.toContain('jobId');
  });

  it('uses an isolated registry for every metrics instance', async () => {
    const first = createMetricsRegistry({
      service: 'first',
      environment: 'test',
      collectDefaults: false,
    });

    const second = createMetricsRegistry({
      service: 'second',
      environment: 'test',
      collectDefaults: false,
    });

    createNewsDiscoveryMetrics(first);
    createNewsDiscoveryMetrics(second);

    await expect(first.metrics()).resolves.toContain('genai_news_discovery_jobs_total');

    await expect(second.metrics()).resolves.toContain('genai_news_discovery_jobs_total');
  });

  it('records discovery enqueue outcomes', async () => {
    const registry = createMetricsRegistry({
      service: 'api',
      environment: 'test',
      collectDefaults: false,
    });

    const metrics = createNewsDiscoveryMetrics(registry);

    metrics.discoveryEnqueueTotal.inc({
      source_id: 'gnews',
      status: 'accepted',
    });

    metrics.discoveryEnqueueDurationSeconds.observe(
      {
        source_id: 'gnews',
      },
      0.025,
    );

    const output = await registry.metrics();

    expect(output).toContain('genai_news_discovery_enqueue_total');

    expect(output).toContain('status="accepted"');

    expect(output).toContain('genai_news_discovery_enqueue_duration_seconds');
  });
});
