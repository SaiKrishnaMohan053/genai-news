import {
  GNewsError,
  RssError,
} from '@genai-news/tools';

import { ZodError } from 'zod';

import { UnsupportedNewsSourceError } from './source-registry.js';

export type DiscoveryFailureClassification =
  | {
      retryable: true;
      reason:
        | 'source-timeout'
        | 'source-network'
        | 'source-http-retryable'
        | 'unknown';
    }
  | {
      retryable: false;
      reason:
        | 'source-http-terminal'
        | 'source-invalid-payload'
        | 'invalid-job-payload'
        | 'unsupported-source';
    };

export function classifyDiscoveryFailure(
  error: unknown,
): DiscoveryFailureClassification {
  if (error instanceof GNewsError) {
    return classifyProviderError({
      kind: error.kind,
      statusCode: error.statusCode,
      invalidPayloadKinds: [
        'invalid-json',
        'invalid-response',
      ],
    });
  }

  if (error instanceof RssError) {
    return classifyProviderError({
      kind: error.kind,
      statusCode: error.statusCode,
      invalidPayloadKinds: [
        'invalid-xml',
        'invalid-feed',
      ],
    });
  }

  if (error instanceof ZodError) {
    return {
      retryable: false,
      reason: 'invalid-job-payload',
    };
  }

  if (error instanceof UnsupportedNewsSourceError) {
    return {
      retryable: false,
      reason: 'unsupported-source',
    };
  }

  return {
    retryable: true,
    reason: 'unknown',
  };
}

type ProviderErrorInput = {
  kind: string;
  statusCode: number | undefined;
  invalidPayloadKinds: readonly string[];
};

function classifyProviderError(
  input: ProviderErrorInput,
): DiscoveryFailureClassification {
  if (input.kind === 'timeout') {
    return {
      retryable: true,
      reason: 'source-timeout',
    };
  }

  if (input.kind === 'network') {
    return {
      retryable: true,
      reason: 'source-network',
    };
  }

  if (input.kind === 'http') {
    if (isRetryableHttpStatus(input.statusCode)) {
      return {
        retryable: true,
        reason: 'source-http-retryable',
      };
    }

    return {
      retryable: false,
      reason: 'source-http-terminal',
    };
  }

  if (input.invalidPayloadKinds.includes(input.kind)) {
    return {
      retryable: false,
      reason: 'source-invalid-payload',
    };
  }

  return {
    retryable: true,
    reason: 'unknown',
  };
}

function isRetryableHttpStatus(
  statusCode: number | undefined,
): boolean {
  if (statusCode === undefined) {
    return true;
  }

  if (statusCode === 408 || statusCode === 429) {
    return true;
  }

  return statusCode >= 500;
}