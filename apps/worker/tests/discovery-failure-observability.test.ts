import { describe, expect, it, vi } from 'vitest';

import {
  annotateDiscoveryFailureSpan,
  type DiscoveryFailureSpan,
} from '../src/news/discovery-failure-observability.js';

describe('annotateDiscoveryFailureSpan', () => {
  it('records retryable failure classification', () => {
    const setAttribute = vi.fn();

    const span: DiscoveryFailureSpan = {
      setAttribute,
    };

    annotateDiscoveryFailureSpan(span, {
      retryable: true,
      reason: 'source-network',
    });

    expect(setAttribute).toHaveBeenCalledWith(
      'news.failure.reason',
      'source-network',
    );

    expect(setAttribute).toHaveBeenCalledWith(
      'news.failure.retryable',
      true,
    );
  });

  it('records terminal failure classification', () => {
    const setAttribute = vi.fn();

    const span: DiscoveryFailureSpan = {
      setAttribute,
    };

    annotateDiscoveryFailureSpan(span, {
      retryable: false,
      reason: 'source-invalid-payload',
    });

    expect(setAttribute).toHaveBeenCalledWith(
      'news.failure.reason',
      'source-invalid-payload',
    );

    expect(setAttribute).toHaveBeenCalledWith(
      'news.failure.retryable',
      false,
    );
  });
});