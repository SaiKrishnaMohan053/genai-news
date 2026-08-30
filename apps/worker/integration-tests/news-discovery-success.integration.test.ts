import {
  createArticleRepository,
  createPrismaClient,
} from '@genai-news/database';

import type {
  NewsSource,
  NewsSourceResult,
} from '@genai-news/shared';

import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { processNewsDiscovery } from '../src/jobs/news-discovery.js';

import type { NewsSourceRegistry } from '../src/news/source-registry.js';

const now = new Date('2026-08-30T12:00:00.000Z');

const canonicalUrl =
  'https://phase1-validation.example.com/full-success';
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is required for worker integration tests',
  );
}

const database = createPrismaClient(databaseUrl);

function createSourceResult(): NewsSourceResult {
  return {
    source: {
      id: 'gnews',
      name: 'GNews',
      type: 'api',
    },

    fetchedAt: new Date('2026-08-30T11:59:00.000Z'),

    articles: [
      {
        externalId: 'phase1-full-success-1',

        title: 'Phase 1 Full Success',

        url: `${canonicalUrl}?utm_source=validation`,

        publishedAt: '2026-08-30T11:30:00.000Z',

        publisher: {
          name: 'Phase 1 Validation Publisher',
        },
      },

      {
        externalId: 'phase1-full-success-stale',

        title: 'Phase 1 Stale Article',

        url: 'https://phase1-validation.example.com/stale',

        publishedAt: '2026-08-20T11:30:00.000Z',
      },

      {
        externalId: 'phase1-full-success-invalid',

        title: '   ',

        url: 'https://phase1-validation.example.com/invalid',

        publishedAt: '2026-08-30T11:30:00.000Z',
      },

      {
        externalId: 'phase1-full-success-duplicate',

        title: 'Phase 1 Full Success',

        url: 'https://phase1-validation.example.com/duplicate',

        publishedAt: '2026-08-30T11:30:00.000Z',

        publisher: {
          name: 'Phase 1 Validation Publisher',
        },
      },
    ],
  };
}

function createRegistry(): NewsSourceRegistry {
  const source: NewsSource = {
    id: 'gnews',
    name: 'GNews',
    type: 'api',

    async fetchLatest() {
      return createSourceResult();
    },
  };

  return {
    get(sourceId: string) {
      if (sourceId !== 'gnews') {
        throw new Error(`Unsupported news source: ${sourceId}`);
      }

      return source;
    },
  };
}

describe('Phase 1 successful discovery integration', () => {
  const repository = createArticleRepository(database);

  beforeEach(async () => {
    await database.article.deleteMany({
      where: {
        canonicalUrl: {
          startsWith:
            'https://phase1-validation.example.com/',
        },
      },
    });
  });

  afterAll(async () => {
    await database.article.deleteMany({
      where: {
        canonicalUrl: {
          startsWith:
            'https://phase1-validation.example.com/',
        },
      },
    });

    await database.$disconnect();
  });

  it('runs the deterministic discovery pipeline into PostgreSQL', async () => {
    const result = await processNewsDiscovery(
      {
        sourceId: 'gnews',
        limit: 10,
        requestedAt: '2026-08-30T11:58:00.000Z',
      },

      {
        sourceRegistry: createRegistry(),

        articleRepository: repository,

        freshnessPolicy: {
          maxAgeMs: 24 * 60 * 60 * 1000,
          maxFutureSkewMs: 5 * 60 * 1000,
          missingPublishedAt: 'reject',
        },

        now: () => now,
      },
    );

    expect(result).toEqual({
      sourceId: 'gnews',

      fetchedCount: 4,

      normalizedCount: 3,
      normalizationRejectedCount: 1,

      freshCount: 2,
      freshnessRejectedCount: 1,

      uniqueCount: 1,
      duplicateCount: 1,

      persistedCount: 1,

      requestedAt: '2026-08-30T11:58:00.000Z',
      completedAt: '2026-08-30T12:00:00.000Z',
    });

    const persisted =
      await repository.findByCanonicalUrl(canonicalUrl);

    expect(persisted).not.toBeNull();

    expect(persisted).toMatchObject({
      title: 'Phase 1 Full Success',

      canonicalUrl,

      sourceId: 'gnews',

      publisherName:
        'Phase 1 Validation Publisher',

      externalId: 'phase1-full-success-1',
    });
  });

  it('remains idempotent when the same discovery is replayed', async () => {
    const dependencies = {
      sourceRegistry: createRegistry(),

      articleRepository: repository,

      freshnessPolicy: {
        maxAgeMs: 24 * 60 * 60 * 1000,
        maxFutureSkewMs: 5 * 60 * 1000,
        missingPublishedAt: 'reject' as const,
      },

      now: () => now,
    };

    await processNewsDiscovery(
      {
        sourceId: 'gnews',
        limit: 10,
        requestedAt: '2026-08-30T11:58:00.000Z',
      },
      dependencies,
    );

    await processNewsDiscovery(
      {
        sourceId: 'gnews',
        limit: 10,
        requestedAt: '2026-08-30T11:58:00.000Z',
      },
      dependencies,
    );

    const rows = await database.article.findMany({
      where: {
        canonicalUrl,
      },
    });

    expect(rows).toHaveLength(1);

    expect(rows[0]?.canonicalUrl).toBe(canonicalUrl);
  });
});