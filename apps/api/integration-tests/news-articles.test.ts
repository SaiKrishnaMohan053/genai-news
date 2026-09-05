import {
  createArticleRepository,
  createPrismaClient,
  type DatabaseClient,
} from '@genai-news/database';
import type { NormalizedArticle } from '@genai-news/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';

const databaseUrl = process.env.DATABASE_URL;
const articleTestUrlPrefix = 'https://article-api.example.com/';

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for API integration tests');
}

describe('news article API integration', () => {
  let database: DatabaseClient;

  beforeAll(() => {
    database = createPrismaClient(databaseUrl);
  });

  beforeEach(async () => {
    await cleanupArticleTestData(database);
  });

  afterAll(async () => {
    await cleanupArticleTestData(database);
    await database.$disconnect();
  });

  it('returns persisted articles newest first', async () => {
    const repository = createArticleRepository(database);

    await repository.persist(
      createArticle({
        title: 'Older article',
        canonicalUrl: `${articleTestUrlPrefix}older`,
        url: `${articleTestUrlPrefix}older`,
        externalId: 'older',
        publishedAt: new Date('2026-08-27T12:00:00.000Z'),
      }),
    );

    await repository.persist(
      createArticle({
        title: 'Newer article',
        canonicalUrl: `${articleTestUrlPrefix}newer`,
        url: `${articleTestUrlPrefix}newer`,
        externalId: 'newer',
        publishedAt: new Date('2026-08-27T14:00:00.000Z'),
      }),
    );

    const app = buildApp({
      logger: false,
      database,
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/news/articles?limit=100',
      });

      expect(response.statusCode).toBe(200);

      const body = response.json<{
        articles: Array<{
          title: string;
          canonicalUrl: string;
        }>;
      }>();

      const titles = body.articles.map((article) => article.title);

      expect(titles).toContain('Newer article');
      expect(titles).toContain('Older article');

      expect(titles.indexOf('Newer article')).toBeLessThan(titles.indexOf('Older article'));
    } finally {
      await app.close();
    }
  });

  it('rejects an invalid article limit', async () => {
    const app = buildApp({
      logger: false,
      database,
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/news/articles?limit=0',
      });

      expect(response.statusCode).toBe(400);

      expect(response.json()).toEqual({
        error: {
          code: 'INVALID_ARTICLE_LIST_REQUEST',
          message: 'Invalid article list request',
        },
      });
    } finally {
      await app.close();
    }
  });
});

function createArticle(overrides: Partial<NormalizedArticle> = {}): NormalizedArticle {
  return {
    title: 'Example article',

    url: `${articleTestUrlPrefix}article`,
    canonicalUrl: `${articleTestUrlPrefix}article`,

    source: {
      id: 'gnews',
      name: 'GNews',
      type: 'api',
    },

    publisher: {
      name: 'Example Publisher',
    },

    externalId: 'article-1',

    publishedAt: new Date('2026-08-27T12:00:00.000Z'),

    discoveredAt: new Date('2026-08-27T12:01:00.000Z'),

    author: null,
    summary: 'Example summary',
    category: null,
    metadata: null,

    ...overrides,
  };
}

async function cleanupArticleTestData(database: DatabaseClient): Promise<void> {
  await database.article.deleteMany({
    where: {
      canonicalUrl: {
        startsWith: articleTestUrlPrefix,
      },
    },
  });
}
