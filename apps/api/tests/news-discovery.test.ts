import type { NewsDiscoveryQueue } from '@genai-news/queue';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createMetricsRegistry,
  createNewsDiscoveryMetrics,
} from '@genai-news/observability';
import { buildApp } from '../src/app.js';

function createQueueMock(): NewsDiscoveryQueue {
  return {
    add: vi.fn().mockResolvedValue({
      id: 'discovery-test-job',
      name: 'news.discovery',
    }),
  } as unknown as NewsDiscoveryQueue;
}
function createTestMetrics() {
  const registry = createMetricsRegistry({
    service: 'api',
    environment: 'test',
    collectDefaults: false,
  });

  return {
    registry,
    metrics: createNewsDiscoveryMetrics(registry),
  };
}
function createFailingQueueMock(): NewsDiscoveryQueue {
  return {
    add: vi
      .fn()
      .mockRejectedValue(
        new Error('redis unavailable'),
      ),
  } as unknown as NewsDiscoveryQueue;
}

describe('news discovery route', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts a valid request and enqueues discovery', async () => {
    const queue = createQueueMock();
    const { registry, metrics } = createTestMetrics();

    const app = buildApp({
      logger: false,

      newsDiscoveryQueue: queue,
      newsDiscoveryMetrics: metrics,

      now: () => new Date('2026-08-27T16:00:00.000Z'),

      createJobId: () => 'discovery-test-job',
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/news/discover',

        payload: {
          sourceId: 'gnews',
          limit: 25,
        },
      });

      const output = await registry.metrics();

      expect(output).toContain(
        'genai_news_discovery_enqueue_total',
      );

      expect(output).toContain(
        'source_id="gnews"',
      );

      expect(output).toContain(
        'status="accepted"',
      );

      expect(response.statusCode).toBe(202);

      expect(response.json()).toEqual({
        status: 'accepted',

        job: {
          id: 'discovery-test-job',
          name: 'news.discovery',
        },
      });

      expect(queue.add).toHaveBeenCalledOnce();

      expect(queue.add).toHaveBeenCalledWith(
        'news.discovery',
        {
          sourceId: 'gnews',
          limit: 25,
          requestedAt: '2026-08-27T16:00:00.000Z',
        },
        expect.objectContaining({
          jobId: 'discovery-test-job',
          attempts: 3,

          backoff: {
            type: 'exponential',
            delay: 1_000,
          },
        }),
      );
    } finally {
      await app.close();
    }
  });

  it('rejects an unsupported source', async () => {
    const queue = createQueueMock();
    function createFailingQueueMock(): NewsDiscoveryQueue {
      return {
        add: vi.fn().mockRejectedValue(
          new Error('redis unavailable'),
        ),
      } as unknown as NewsDiscoveryQueue;
    }

    const app = buildApp({
      logger: false,
      newsDiscoveryQueue: queue,
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/news/discover',

        payload: {
          sourceId: 'unknown',
          limit: 25,
        },
      });

      expect(response.statusCode).toBe(400);

      expect(response.json()).toEqual({
        error: {
          code: 'INVALID_DISCOVERY_REQUEST',
          message: 'Invalid news discovery request',
        },
      });

      expect(queue.add).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('records a failed enqueue when the queue rejects', async () => {
    const queue = createFailingQueueMock();

    const { registry, metrics } = createTestMetrics();

    const app = buildApp({
      logger: false,

      newsDiscoveryQueue: queue,
      newsDiscoveryMetrics: metrics,

      now: () => new Date('2026-08-27T16:00:00.000Z'),

      createJobId: () => 'discovery-failed-job',
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/news/discover',

        payload: {
          sourceId: 'gnews',
          limit: 25,
        },
      });

      expect(response.statusCode).toBe(500);

      expect(response.json()).toEqual({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error',
        },
      });

      const output = await registry.metrics();

      expect(output).toContain(
        'genai_news_discovery_enqueue_total',
      );

      expect(output).toContain(
        'source_id="gnews"',
      );

      expect(output).toContain(
        'status="failed"',
      );

      expect(queue.add).toHaveBeenCalledOnce();
    } finally {
      await app.close();
    }
  });

  it('rejects a non-positive limit', async () => {
    const queue = createQueueMock();

    const app = buildApp({
      logger: false,
      newsDiscoveryQueue: queue,
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/news/discover',

        payload: {
          sourceId: 'gnews',
          limit: 0,
        },
      });

      expect(response.statusCode).toBe(400);

      expect(queue.add).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('rejects a limit above 100', async () => {
    const queue = createQueueMock();

    const app = buildApp({
      logger: false,
      newsDiscoveryQueue: queue,
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/news/discover',

        payload: {
          sourceId: 'gnews',
          limit: 101,
        },
      });

      expect(response.statusCode).toBe(400);

      expect(queue.add).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('returns 503 when discovery queue is unavailable', async () => {
    const app = buildApp({
      logger: false,
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/news/discover',

        payload: {
          sourceId: 'gnews',
          limit: 25,
        },
      });

      expect(response.statusCode).toBe(503);

      expect(response.json()).toEqual({
        error: {
          code: 'NEWS_DISCOVERY_UNAVAILABLE',
          message: 'News discovery queue is unavailable',
        },
      });
    } finally {
      await app.close();
    }
  });
});
