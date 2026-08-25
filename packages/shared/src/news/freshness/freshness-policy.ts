import type { NormalizedArticle } from '../normalized-article.js';

export const MISSING_PUBLISHED_AT_POLICIES = ['reject', 'use-discovered-at'] as const;

export type MissingPublishedAtPolicy = (typeof MISSING_PUBLISHED_AT_POLICIES)[number];

export type FreshnessPolicy = {
  maxAgeMs: number;
  maxFutureSkewMs: number;
  missingPublishedAt: MissingPublishedAtPolicy;
};

export const ARTICLE_FRESHNESS_CLASSIFICATIONS = [
  'fresh',
  'stale',
  'missing-published-at',
  'future-published-at',
] as const;

export type ArticleFreshnessClassification = (typeof ARTICLE_FRESHNESS_CLASSIFICATIONS)[number];

export type FreshnessTimestampBasis = 'published-at' | 'discovered-at';

export type ArticleFreshnessResult = {
  accepted: boolean;
  classification: ArticleFreshnessClassification;

  timestampBasis: FreshnessTimestampBasis | null;
  evaluatedTimestamp: Date | null;

  ageMs: number | null;
};

export type EvaluateArticleFreshnessInput = {
  article: NormalizedArticle;
  policy: FreshnessPolicy;
  now: Date;
};

export function evaluateArticleFreshness(
  input: EvaluateArticleFreshnessInput,
): ArticleFreshnessResult {
  validatePolicy(input.policy);
  validateDate(input.now, 'now');
  validateDate(input.article.discoveredAt, 'article.discoveredAt');

  if (input.article.publishedAt !== null) {
    validateDate(input.article.publishedAt, 'article.publishedAt');

    return evaluateTimestamp({
      timestamp: input.article.publishedAt,
      timestampBasis: 'published-at',
      now: input.now,
      policy: input.policy,
    });
  }

  if (input.policy.missingPublishedAt === 'reject') {
    return {
      accepted: false,
      classification: 'missing-published-at',
      timestampBasis: null,
      evaluatedTimestamp: null,
      ageMs: null,
    };
  }

  return evaluateTimestamp({
    timestamp: input.article.discoveredAt,
    timestampBasis: 'discovered-at',
    now: input.now,
    policy: input.policy,
  });
}

type EvaluateTimestampInput = {
  timestamp: Date;
  timestampBasis: FreshnessTimestampBasis;
  now: Date;
  policy: FreshnessPolicy;
};

function evaluateTimestamp(input: EvaluateTimestampInput): ArticleFreshnessResult {
  const ageMs = input.now.getTime() - input.timestamp.getTime();

  if (ageMs < -input.policy.maxFutureSkewMs) {
    return {
      accepted: false,
      classification: 'future-published-at',
      timestampBasis: input.timestampBasis,
      evaluatedTimestamp: input.timestamp,
      ageMs,
    };
  }

  if (ageMs > input.policy.maxAgeMs) {
    return {
      accepted: false,
      classification: 'stale',
      timestampBasis: input.timestampBasis,
      evaluatedTimestamp: input.timestamp,
      ageMs,
    };
  }

  return {
    accepted: true,
    classification: 'fresh',
    timestampBasis: input.timestampBasis,
    evaluatedTimestamp: input.timestamp,
    ageMs,
  };
}

function validatePolicy(policy: FreshnessPolicy): void {
  if (!Number.isFinite(policy.maxAgeMs) || policy.maxAgeMs < 0) {
    throw new Error('Freshness maxAgeMs must be a finite non-negative number.');
  }

  if (!Number.isFinite(policy.maxFutureSkewMs) || policy.maxFutureSkewMs < 0) {
    throw new Error('Freshness maxFutureSkewMs must be a finite non-negative number.');
  }
}

function validateDate(value: Date, field: string): void {
  if (Number.isNaN(value.getTime())) {
    throw new Error(`${field} must be a valid Date.`);
  }
}
