import type { NewsEvaluationCorpus } from '../contracts.js';

const source = {
  id: 'gnews',
  name: 'GNews',
  type: 'api',
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export const phase1NewsBaseline: NewsEvaluationCorpus = {
  id: 'phase1-baseline-v1',

  description: 'Golden deterministic Phase 1 news discovery regression baseline.',

  now: new Date('2026-08-29T12:00:00.000Z'),

  freshnessPolicy: {
    maxAgeMs: DAY_MS,
    maxFutureSkewMs: 5 * MINUTE_MS,
    missingPublishedAt: 'reject',
  },

  cases: [
    {
      id: 'retained-basic',

      description: 'A valid recent article survives the deterministic discovery pipeline.',

      source,

      article: {
        externalId: 'article-1',
        title: ' Example News Story ',
        url: 'https://example.com/story?utm_source=test',
        publishedAt: '2026-08-29T10:00:00.000Z',
        publisher: {
          name: 'Example Publisher',
        },
      },

      discoveredAt: new Date('2026-08-29T11:00:00.000Z'),

      expected: {
        normalization: {
          status: 'accepted',
          canonicalUrl: 'https://example.com/story',
        },

        freshness: {
          accepted: true,
          classification: 'fresh',
        },

        deduplication: {
          status: 'unique',
        },

        finalOutcome: 'retained',
      },
    },

    {
      id: 'retained-canonical-query-order',

      description:
        'Tracking parameters and fragments are removed while canonical query parameters are sorted.',

      source,

      article: {
        externalId: 'article-query',
        title: 'Canonical Query Ordering',
        url: 'https://example.com/query?z=2&utm_source=feed&a=1#section',
        publishedAt: '2026-08-29T10:15:00.000Z',
        publisher: {
          name: 'Query Publisher',
        },
      },

      discoveredAt: new Date('2026-08-29T11:00:00.000Z'),

      expected: {
        normalization: {
          status: 'accepted',
          canonicalUrl: 'https://example.com/query?a=1&z=2',
        },

        freshness: {
          accepted: true,
          classification: 'fresh',
        },

        deduplication: {
          status: 'unique',
        },

        finalOutcome: 'retained',
      },
    },

    {
      id: 'retained-max-age-boundary',

      description: 'An article exactly at the maximum age boundary remains fresh.',

      source,

      article: {
        externalId: 'article-age-boundary',
        title: 'Maximum Age Boundary',
        url: 'https://example.com/max-age-boundary',
        publishedAt: '2026-08-28T12:00:00.000Z',
        publisher: {
          name: 'Boundary Publisher',
        },
      },

      discoveredAt: new Date('2026-08-29T11:00:00.000Z'),

      expected: {
        normalization: {
          status: 'accepted',
          canonicalUrl: 'https://example.com/max-age-boundary',
        },

        freshness: {
          accepted: true,
          classification: 'fresh',
        },

        deduplication: {
          status: 'unique',
        },

        finalOutcome: 'retained',
      },
    },

    {
      id: 'retained-future-skew-boundary',

      description: 'An article exactly at the allowed future clock-skew boundary remains fresh.',

      source,

      article: {
        externalId: 'article-future-boundary',
        title: 'Future Skew Boundary',
        url: 'https://example.com/future-boundary',
        publishedAt: '2026-08-29T12:05:00.000Z',
        publisher: {
          name: 'Clock Publisher',
        },
      },

      discoveredAt: new Date('2026-08-29T11:59:00.000Z'),

      expected: {
        normalization: {
          status: 'accepted',
          canonicalUrl: 'https://example.com/future-boundary',
        },

        freshness: {
          accepted: true,
          classification: 'fresh',
        },

        deduplication: {
          status: 'unique',
        },

        finalOutcome: 'retained',
      },
    },

    {
      id: 'retained-similar-but-distinct',

      description:
        'A similar headline from the same publisher remains unique when the deterministic title key differs.',

      source,

      article: {
        externalId: 'article-similar',
        title: 'Example News Story Updated',
        url: 'https://example.com/story-updated',
        publishedAt: '2026-08-29T10:45:00.000Z',
        publisher: {
          name: 'Example Publisher',
        },
      },

      discoveredAt: new Date('2026-08-29T11:15:00.000Z'),

      expected: {
        normalization: {
          status: 'accepted',
          canonicalUrl: 'https://example.com/story-updated',
        },

        freshness: {
          accepted: true,
          classification: 'fresh',
        },

        deduplication: {
          status: 'unique',
        },

        finalOutcome: 'retained',
      },
    },

    {
      id: 'duplicate-source-external-id',

      description:
        'The same source external ID is classified as a duplicate before weaker keys are considered.',

      source,

      article: {
        externalId: 'article-1',
        title: 'Completely Different Headline',
        url: 'https://example.com/external-id-copy',
        publishedAt: '2026-08-29T10:30:00.000Z',
        publisher: {
          name: 'Different Publisher',
        },
      },

      discoveredAt: new Date('2026-08-29T11:20:00.000Z'),

      expected: {
        normalization: {
          status: 'accepted',
          canonicalUrl: 'https://example.com/external-id-copy',
        },

        freshness: {
          accepted: true,
          classification: 'fresh',
        },

        deduplication: {
          status: 'duplicate',
          reason: 'source-external-id',
          duplicateOfCaseId: 'retained-basic',
        },

        finalOutcome: 'duplicate',
      },
    },

    {
      id: 'duplicate-canonical-url',

      description:
        'Different provider metadata resolving to the same canonical URL is classified as a duplicate.',

      source,

      article: {
        externalId: 'article-canonical-copy',
        title: 'Different Canonical Headline',
        url: 'https://example.com/story?utm_medium=social&fbclid=tracking',
        publishedAt: '2026-08-29T10:35:00.000Z',
        publisher: {
          name: 'Another Publisher',
        },
      },

      discoveredAt: new Date('2026-08-29T11:25:00.000Z'),

      expected: {
        normalization: {
          status: 'accepted',
          canonicalUrl: 'https://example.com/story',
        },

        freshness: {
          accepted: true,
          classification: 'fresh',
        },

        deduplication: {
          status: 'duplicate',
          reason: 'canonical-url',
          duplicateOfCaseId: 'retained-basic',
        },

        finalOutcome: 'duplicate',
      },
    },

    {
      id: 'duplicate-publisher-title',

      description:
        'Equivalent normalized publisher and title identity is classified as a duplicate despite a different URL.',

      source,

      article: {
        externalId: 'article-title-copy',
        title: '  example   news story  ',
        url: 'https://example.com/syndicated-story',
        publishedAt: '2026-08-29T10:40:00.000Z',
        publisher: {
          name: ' Example Publisher ',
        },
      },

      discoveredAt: new Date('2026-08-29T11:30:00.000Z'),

      expected: {
        normalization: {
          status: 'accepted',
          canonicalUrl: 'https://example.com/syndicated-story',
        },

        freshness: {
          accepted: true,
          classification: 'fresh',
        },

        deduplication: {
          status: 'duplicate',
          reason: 'publisher-title',
          duplicateOfCaseId: 'retained-basic',
        },

        finalOutcome: 'duplicate',
      },
    },

    {
      id: 'rejected-invalid-source',

      description: 'An invalid source descriptor is rejected during normalization.',

      source: {
        id: '',
        name: 'GNews',
        type: 'api',
      },

      article: {
        title: 'Valid Article',
        url: 'https://example.com/invalid-source',
        publishedAt: '2026-08-29T10:00:00.000Z',
      },

      discoveredAt: new Date('2026-08-29T11:00:00.000Z'),

      expected: {
        normalization: {
          status: 'rejected',
          reason: 'invalid-source',
        },

        finalOutcome: 'rejected-normalization',
      },
    },

    {
      id: 'rejected-invalid-article-shape',

      description:
        'A structurally invalid source article is rejected before semantic normalization.',

      source,

      article: {
        title: 'Invalid Publisher Shape',
        url: 'https://example.com/invalid-shape',
        publishedAt: '2026-08-29T10:00:00.000Z',
        publisher: {
          name: '   ',
        },
      },

      discoveredAt: new Date('2026-08-29T11:00:00.000Z'),

      expected: {
        normalization: {
          status: 'rejected',
          reason: 'invalid-article-shape',
        },

        finalOutcome: 'rejected-normalization',
      },
    },

    {
      id: 'rejected-missing-title',

      description: 'An article without a usable title fails normalization.',

      source,

      article: {
        title: '   ',
        url: 'https://example.com/no-title',
        publishedAt: '2026-08-29T10:00:00.000Z',
      },

      discoveredAt: new Date('2026-08-29T11:00:00.000Z'),

      expected: {
        normalization: {
          status: 'rejected',
          reason: 'missing-title',
        },

        finalOutcome: 'rejected-normalization',
      },
    },

    {
      id: 'rejected-missing-url',

      description: 'An article without a usable URL fails normalization.',

      source,

      article: {
        title: 'Missing URL Story',
        url: '   ',
        publishedAt: '2026-08-29T10:00:00.000Z',
      },

      discoveredAt: new Date('2026-08-29T11:00:00.000Z'),

      expected: {
        normalization: {
          status: 'rejected',
          reason: 'missing-url',
        },

        finalOutcome: 'rejected-normalization',
      },
    },

    {
      id: 'rejected-invalid-url',

      description: 'A non-HTTP article URL fails URL normalization.',

      source,

      article: {
        title: 'Invalid URL Story',
        url: 'ftp://example.com/story',
        publishedAt: '2026-08-29T10:00:00.000Z',
      },

      discoveredAt: new Date('2026-08-29T11:00:00.000Z'),

      expected: {
        normalization: {
          status: 'rejected',
          reason: 'invalid-url',
        },

        finalOutcome: 'rejected-normalization',
      },
    },

    {
      id: 'rejected-invalid-published-at',

      description: 'An unparseable publication timestamp fails normalization.',

      source,

      article: {
        title: 'Invalid Date Story',
        url: 'https://example.com/invalid-date',
        publishedAt: 'not-a-date',
      },

      discoveredAt: new Date('2026-08-29T11:00:00.000Z'),

      expected: {
        normalization: {
          status: 'rejected',
          reason: 'invalid-published-at',
        },

        finalOutcome: 'rejected-normalization',
      },
    },

    {
      id: 'rejected-stale',

      description: 'An article one millisecond older than the maximum age is stale.',

      source,

      article: {
        externalId: 'article-stale',
        title: 'Stale Story',
        url: 'https://example.com/stale',
        publishedAt: '2026-08-28T11:59:59.999Z',
      },

      discoveredAt: new Date('2026-08-29T11:00:00.000Z'),

      expected: {
        normalization: {
          status: 'accepted',
          canonicalUrl: 'https://example.com/stale',
        },

        freshness: {
          accepted: false,
          classification: 'stale',
        },

        finalOutcome: 'rejected-freshness',
      },
    },

    {
      id: 'rejected-missing-published-at',

      description: 'Missing publication time is rejected under the golden freshness policy.',

      source,

      article: {
        externalId: 'article-missing-date',
        title: 'Missing Publication Time',
        url: 'https://example.com/missing-publication-time',
      },

      discoveredAt: new Date('2026-08-29T11:00:00.000Z'),

      expected: {
        normalization: {
          status: 'accepted',
          canonicalUrl: 'https://example.com/missing-publication-time',
        },

        freshness: {
          accepted: false,
          classification: 'missing-published-at',
        },

        finalOutcome: 'rejected-freshness',
      },
    },

    {
      id: 'rejected-future-published-at',

      description: 'An article one millisecond beyond the permitted future skew is rejected.',

      source,

      article: {
        externalId: 'article-future',
        title: 'Future Story',
        url: 'https://example.com/future',
        publishedAt: '2026-08-29T12:05:00.001Z',
      },

      discoveredAt: new Date('2026-08-29T11:59:00.000Z'),

      expected: {
        normalization: {
          status: 'accepted',
          canonicalUrl: 'https://example.com/future',
        },

        freshness: {
          accepted: false,
          classification: 'future-published-at',
        },

        finalOutcome: 'rejected-freshness',
      },
    },
  ],
};
