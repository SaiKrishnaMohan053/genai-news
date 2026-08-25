import { describe, expect, it } from 'vitest';

import {
  evaluateArticleFreshness,
  type FreshnessPolicy,
  type NormalizedArticle,
} from '../src/news/index.js';

const now = new Date('2026-08-25T17:00:00.000Z');

const policy: FreshnessPolicy = {
  maxAgeMs: 24 * 60 * 60 * 1000,
  maxFutureSkewMs: 5 * 60 * 1000,
  missingPublishedAt: 'reject',
};

function createArticle(overrides: Partial<NormalizedArticle> = {}): NormalizedArticle {
  return {
    title: 'Example article',

    url: 'https://example.com/article',
    canonicalUrl: 'https://example.com/article',

    source: {
      id: 'test-source',
      name: 'Test Source',
      type: 'api',
    },

    publisher: null,
    externalId: null,

    publishedAt: new Date('2026-08-25T16:00:00.000Z'),

    discoveredAt: new Date('2026-08-25T16:30:00.000Z'),

    author: null,
    summary: null,
    category: null,
    metadata: null,

    ...overrides,
  };
}

describe('evaluateArticleFreshness', () => {
  it('accepts a fresh article', () => {
    const article = createArticle();

    const result = evaluateArticleFreshness({
      article,
      policy,
      now,
    });

    expect(result).toEqual({
      accepted: true,
      classification: 'fresh',
      timestampBasis: 'published-at',
      evaluatedTimestamp: article.publishedAt,
      ageMs: 60 * 60 * 1000,
    });
  });

  it('accepts an article exactly at the freshness boundary', () => {
    const article = createArticle({
      publishedAt: new Date('2026-08-24T17:00:00.000Z'),
    });

    const result = evaluateArticleFreshness({
      article,
      policy,
      now,
    });

    expect(result.accepted).toBe(true);
    expect(result.classification).toBe('fresh');
  });

  it('rejects an article older than the freshness window', () => {
    const article = createArticle({
      publishedAt: new Date('2026-08-24T16:59:59.999Z'),
    });

    const result = evaluateArticleFreshness({
      article,
      policy,
      now,
    });

    expect(result.accepted).toBe(false);
    expect(result.classification).toBe('stale');
    expect(result.timestampBasis).toBe('published-at');
  });

  it('accepts a slightly future timestamp within allowed skew', () => {
    const article = createArticle({
      publishedAt: new Date('2026-08-25T17:05:00.000Z'),
    });

    const result = evaluateArticleFreshness({
      article,
      policy,
      now,
    });

    expect(result.accepted).toBe(true);
    expect(result.classification).toBe('fresh');
    expect(result.ageMs).toBe(-5 * 60 * 1000);
  });

  it('rejects a timestamp beyond allowed future skew', () => {
    const article = createArticle({
      publishedAt: new Date('2026-08-25T17:05:00.001Z'),
    });

    const result = evaluateArticleFreshness({
      article,
      policy,
      now,
    });

    expect(result.accepted).toBe(false);
    expect(result.classification).toBe('future-published-at');
    expect(result.timestampBasis).toBe('published-at');
  });

  it('rejects a missing publication timestamp when policy says reject', () => {
    const article = createArticle({
      publishedAt: null,
    });

    const result = evaluateArticleFreshness({
      article,
      policy,
      now,
    });

    expect(result).toEqual({
      accepted: false,
      classification: 'missing-published-at',
      timestampBasis: null,
      evaluatedTimestamp: null,
      ageMs: null,
    });
  });

  it('uses discoveredAt when publication timestamp is missing and fallback is enabled', () => {
    const article = createArticle({
      publishedAt: null,
      discoveredAt: new Date('2026-08-25T16:30:00.000Z'),
    });

    const result = evaluateArticleFreshness({
      article,
      policy: {
        ...policy,
        missingPublishedAt: 'use-discovered-at',
      },
      now,
    });

    expect(result).toEqual({
      accepted: true,
      classification: 'fresh',
      timestampBasis: 'discovered-at',
      evaluatedTimestamp: article.discoveredAt,
      ageMs: 30 * 60 * 1000,
    });
  });

  it('can classify discoveredAt fallback as stale', () => {
    const article = createArticle({
      publishedAt: null,
      discoveredAt: new Date('2026-08-24T16:00:00.000Z'),
    });

    const result = evaluateArticleFreshness({
      article,
      policy: {
        ...policy,
        missingPublishedAt: 'use-discovered-at',
      },
      now,
    });

    expect(result.accepted).toBe(false);
    expect(result.classification).toBe('stale');
    expect(result.timestampBasis).toBe('discovered-at');
  });

  it('does not depend on local timezone representation', () => {
    const article = createArticle({
      publishedAt: new Date('2026-08-25T12:00:00-04:00'),
    });

    const result = evaluateArticleFreshness({
      article,
      policy,
      now,
    });

    expect(result.accepted).toBe(true);
    expect(result.ageMs).toBe(60 * 60 * 1000);
  });

  it('rejects an invalid now value', () => {
    expect(() =>
      evaluateArticleFreshness({
        article: createArticle(),
        policy,
        now: new Date('invalid'),
      }),
    ).toThrow('now must be a valid Date.');
  });

  it('rejects an invalid publishedAt date', () => {
    expect(() =>
      evaluateArticleFreshness({
        article: createArticle({
          publishedAt: new Date('invalid'),
        }),
        policy,
        now,
      }),
    ).toThrow('article.publishedAt must be a valid Date.');
  });

  it('rejects an invalid discoveredAt date', () => {
    expect(() =>
      evaluateArticleFreshness({
        article: createArticle({
          discoveredAt: new Date('invalid'),
        }),
        policy,
        now,
      }),
    ).toThrow('article.discoveredAt must be a valid Date.');
  });

  it('rejects a negative freshness window', () => {
    expect(() =>
      evaluateArticleFreshness({
        article: createArticle(),
        policy: {
          ...policy,
          maxAgeMs: -1,
        },
        now,
      }),
    ).toThrow('Freshness maxAgeMs must be a finite non-negative number.');
  });

  it('rejects a negative future-skew allowance', () => {
    expect(() =>
      evaluateArticleFreshness({
        article: createArticle(),
        policy: {
          ...policy,
          maxFutureSkewMs: -1,
        },
        now,
      }),
    ).toThrow('Freshness maxFutureSkewMs must be a finite non-negative number.');
  });

  it('supports a zero-age freshness window deterministically', () => {
    const article = createArticle({
      publishedAt: now,
    });

    const result = evaluateArticleFreshness({
      article,
      policy: {
        ...policy,
        maxAgeMs: 0,
      },
      now,
    });

    expect(result.accepted).toBe(true);
    expect(result.classification).toBe('fresh');
    expect(result.ageMs).toBe(0);
  });
});
