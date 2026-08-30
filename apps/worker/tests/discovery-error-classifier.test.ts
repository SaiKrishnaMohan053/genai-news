import { GNewsError, RssError } from '@genai-news/tools';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { classifyDiscoveryFailure } from '../src/news/discovery-error-classifier.js';

import { UnsupportedNewsSourceError } from '../src/news/source-registry.js';

describe('classifyDiscoveryFailure', () => {
  it('retries source timeout and network failures', () => {
    expect(
      classifyDiscoveryFailure(
        new GNewsError({
          kind: 'timeout',
          message: 'timeout',
        }),
      ),
    ).toEqual({
      retryable: true,
      reason: 'source-timeout',
    });

    expect(
      classifyDiscoveryFailure(
        new RssError({
          kind: 'network',
          message: 'network',
        }),
      ),
    ).toEqual({
      retryable: true,
      reason: 'source-network',
    });
  });

  it('retries HTTP 408, 429, and 5xx failures', () => {
    for (const statusCode of [408, 429, 500, 503]) {
      expect(
        classifyDiscoveryFailure(
          new GNewsError({
            kind: 'http',
            statusCode,
            message: `HTTP ${statusCode}`,
          }),
        ),
      ).toEqual({
        retryable: true,
        reason: 'source-http-retryable',
      });
    }
  });

  it('treats ordinary HTTP 4xx failures as terminal', () => {
    for (const statusCode of [400, 401, 403, 404, 422]) {
      expect(
        classifyDiscoveryFailure(
          new GNewsError({
            kind: 'http',
            statusCode,
            message: `HTTP ${statusCode}`,
          }),
        ),
      ).toEqual({
        retryable: false,
        reason: 'source-http-terminal',
      });
    }
  });

  it('treats malformed provider payloads as terminal', () => {
    expect(
      classifyDiscoveryFailure(
        new GNewsError({
          kind: 'invalid-json',
          message: 'invalid json',
        }),
      ),
    ).toEqual({
      retryable: false,
      reason: 'source-invalid-payload',
    });

    expect(
      classifyDiscoveryFailure(
        new GNewsError({
          kind: 'invalid-response',
          message: 'invalid response',
        }),
      ),
    ).toEqual({
      retryable: false,
      reason: 'source-invalid-payload',
    });

    expect(
      classifyDiscoveryFailure(
        new RssError({
          kind: 'invalid-xml',
          message: 'invalid xml',
        }),
      ),
    ).toEqual({
      retryable: false,
      reason: 'source-invalid-payload',
    });

    expect(
      classifyDiscoveryFailure(
        new RssError({
          kind: 'invalid-feed',
          message: 'invalid feed',
        }),
      ),
    ).toEqual({
      retryable: false,
      reason: 'source-invalid-payload',
    });
  });

  it('treats invalid job payloads and unsupported sources as terminal', () => {
    const schema = z.object({
      value: z.string(),
    });

    const parsed = schema.safeParse({
      value: 123,
    });

    if (parsed.success) {
      throw new Error('Expected fixture schema validation to fail.');
    }

    expect(classifyDiscoveryFailure(parsed.error)).toEqual({
      retryable: false,
      reason: 'invalid-job-payload',
    });

    expect(classifyDiscoveryFailure(new UnsupportedNewsSourceError('unknown'))).toEqual({
      retryable: false,
      reason: 'unsupported-source',
    });
  });

  it('keeps unknown failures retryable', () => {
    expect(classifyDiscoveryFailure(new Error('database unavailable'))).toEqual({
      retryable: true,
      reason: 'unknown',
    });
  });
});
