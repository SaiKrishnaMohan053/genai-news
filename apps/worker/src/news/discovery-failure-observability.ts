import type { DiscoveryFailureClassification } from './discovery-error-classifier.js';

export type DiscoveryFailureSpan = {
  setAttribute(
    name: string,
    value: string | boolean | number,
  ): unknown;
};

export function annotateDiscoveryFailureSpan(
  span: DiscoveryFailureSpan,
  classification: DiscoveryFailureClassification,
): void {
  span.setAttribute(
    'news.failure.reason',
    classification.reason,
  );

  span.setAttribute(
    'news.failure.retryable',
    classification.retryable,
  );
}