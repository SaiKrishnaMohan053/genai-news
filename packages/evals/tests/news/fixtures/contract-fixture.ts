import type { NewsEvaluationCorpus } from '../../../src/news/contracts.js';

const source = {
  id: 'gnews',
  name: 'GNews',
  type: 'api',
};

export const contractFixture: NewsEvaluationCorpus = {
  id: 'phase1-contract-fixture',

  description: 'Small deterministic fixture used to verify Phase 1 evaluation contracts.',

  now: new Date('2026-08-29T12:00:00.000Z'),

  freshnessPolicy: {
    maxAgeMs: 24 * 60 * 60 * 1000,
    maxFutureSkewMs: 5 * 60 * 1000,
    missingPublishedAt: 'reject',
  },

  cases: [
    {
      id: 'retained-basic',

      description: 'A valid recent article should survive the Phase 1 deterministic pipeline.',

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
      id: 'duplicate-canonical-url',

      description: 'A second article resolving to the same canonical URL should be a duplicate.',

      source,

      article: {
        externalId: 'article-2',
        title: 'Another Headline',
        url: 'https://example.com/story?utm_medium=social',
        publishedAt: '2026-08-29T10:30:00.000Z',
        publisher: {
          name: 'Different Publisher',
        },
      },

      discoveredAt: new Date('2026-08-29T11:05:00.000Z'),

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
      id: 'rejected-missing-title',

      description: 'An article without a usable title should fail normalization.',

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
      id: 'rejected-stale',

      description: 'A structurally valid but old article should fail the freshness policy.',

      source,

      article: {
        externalId: 'article-old',
        title: 'Old News Story',
        url: 'https://example.com/old-story',
        publishedAt: '2026-08-27T10:00:00.000Z',
      },

      discoveredAt: new Date('2026-08-29T11:00:00.000Z'),

      expected: {
        normalization: {
          status: 'accepted',
          canonicalUrl: 'https://example.com/old-story',
        },

        freshness: {
          accepted: false,
          classification: 'stale',
        },

        finalOutcome: 'rejected-freshness',
      },
    },
  ],
};
