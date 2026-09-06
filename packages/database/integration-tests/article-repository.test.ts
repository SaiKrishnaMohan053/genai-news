import type { NormalizedArticle } from '@genai-news/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createArticleRepository, createPrismaClient, type DatabaseClient } from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
const testUrlPrefix = 'https://article-repository.integration.example.com/';

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for database integration tests');
}

describe('article repository integration', () => {
  let database: DatabaseClient;

  beforeAll(() => {
    database = createPrismaClient(databaseUrl);
  });

  beforeEach(async () => {
    await cleanup(database);
  });

  afterAll(async () => {
    await cleanup(database);
    await database.$disconnect();
  });

  it('persists a normalized article', async () => {
    const repository = createArticleRepository(database);

    const article = createArticle();

    const persisted = await repository.persist(article);

    expect(persisted).toMatchObject({
      title: article.title,
      url: article.url,
      canonicalUrl: article.canonicalUrl,

      sourceId: article.source.id,
      sourceName: article.source.name,
      sourceType: article.source.type,

      externalId: article.externalId,

      firstDiscoveredAt: article.discoveredAt,
      lastSeenAt: article.discoveredAt,
    });

    expect(
      await database.article.count({
        where: {
          canonicalUrl: {
            startsWith: testUrlPrefix,
          },
        },
      }),
    ).toBe(1);
  });

  it('is idempotent for repeated canonical URLs', async () => {
    const repository = createArticleRepository(database);

    const article = createArticle();

    const first = await repository.persist(article);

    const second = await repository.persist(article);

    expect(second.id).toBe(first.id);

    expect(
      await database.article.count({
        where: {
          canonicalUrl: {
            startsWith: testUrlPrefix,
          },
        },
      }),
    ).toBe(1);
  });

  it('updates lastSeenAt on rediscovery', async () => {
    const repository = createArticleRepository(database);

    const firstSeen = new Date('2026-08-25T12:00:00.000Z');

    const laterSeen = new Date('2026-08-25T12:05:00.000Z');

    await repository.persist(
      createArticle({
        discoveredAt: firstSeen,
      }),
    );

    const persisted = await repository.persist(
      createArticle({
        discoveredAt: laterSeen,
        summary: 'Updated summary',
      }),
    );

    expect(persisted.firstDiscoveredAt).toEqual(firstSeen);

    expect(persisted.lastSeenAt).toEqual(laterSeen);

    expect(persisted.summary).toBe('Updated summary');
  });

  it('preserves earliest firstDiscoveredAt when an older retry arrives later', async () => {
    const repository = createArticleRepository(database);

    const laterSeen = new Date('2026-08-25T12:05:00.000Z');

    const earlierSeen = new Date('2026-08-25T12:00:00.000Z');

    await repository.persist(
      createArticle({
        discoveredAt: laterSeen,
      }),
    );

    const persisted = await repository.persist(
      createArticle({
        discoveredAt: earlierSeen,
      }),
    );

    expect(persisted.firstDiscoveredAt).toEqual(earlierSeen);

    expect(persisted.lastSeenAt).toEqual(laterSeen);
  });

  it('does not let an older retry overwrite newer article fields', async () => {
    const repository = createArticleRepository(database);

    await repository.persist(
      createArticle({
        discoveredAt: new Date('2026-08-25T12:05:00.000Z'),
        title: 'Newest title',
        summary: 'Newest summary',
      }),
    );

    const persisted = await repository.persist(
      createArticle({
        discoveredAt: new Date('2026-08-25T12:00:00.000Z'),
        title: 'Older title',
        summary: 'Older summary',
      }),
    );

    expect(persisted.title).toBe('Newest title');

    expect(persisted.summary).toBe('Newest summary');
  });

  it('allows newer rediscovery fields to replace older fields', async () => {
    const repository = createArticleRepository(database);

    await repository.persist(
      createArticle({
        discoveredAt: new Date('2026-08-25T12:00:00.000Z'),
        title: 'Old title',
      }),
    );

    const persisted = await repository.persist(
      createArticle({
        discoveredAt: new Date('2026-08-25T12:05:00.000Z'),
        title: 'New title',
      }),
    );

    expect(persisted.title).toBe('New title');
  });

  it('handles concurrent writes for the same canonical URL idempotently', async () => {
    const repository = createArticleRepository(database);

    const writes = Array.from(
      {
        length: 10,
      },
      (_, index) =>
        repository.persist(
          createArticle({
            discoveredAt: new Date(Date.UTC(2026, 7, 25, 12, index)),
            summary: `version-${index}`,
          }),
        ),
    );

    await Promise.all(writes);

    expect(
      await database.article.count({
        where: {
          canonicalUrl: {
            startsWith: testUrlPrefix,
          },
        },
      }),
    ).toBe(1);

    const persisted = await repository.findByCanonicalUrl(`${testUrlPrefix}article`);

    expect(persisted).not.toBeNull();

    expect(persisted?.firstDiscoveredAt).toEqual(new Date('2026-08-25T12:00:00.000Z'));

    expect(persisted?.lastSeenAt).toEqual(new Date('2026-08-25T12:09:00.000Z'));

    expect(persisted?.summary).toBe('version-9');
  });

  it('stores different canonical URLs as different rows', async () => {
    const repository = createArticleRepository(database);

    await repository.persist(
      createArticle({
        canonicalUrl: `${testUrlPrefix}article-1`,
        url: `${testUrlPrefix}article-1`,
      }),
    );

    await repository.persist(
      createArticle({
        canonicalUrl: `${testUrlPrefix}article-2`,
        url: `${testUrlPrefix}article-2`,
      }),
    );

    expect(
      await database.article.count({
        where: {
          canonicalUrl: {
            startsWith: testUrlPrefix,
          },
        },
      }),
    ).toBe(2);
  });

  it('persists nullable fields and JSON metadata', async () => {
    const repository = createArticleRepository(database);

    const persisted = await repository.persist(
      createArticle({
        publisher: null,
        externalId: null,
        publishedAt: null,
        author: null,
        summary: null,
        category: null,
        metadata: {
          language: 'en',
          nested: {
            value: 1,
          },
        },
      }),
    );

    expect(persisted.publisherId).toBeNull();
    expect(persisted.publisherName).toBeNull();
    expect(persisted.externalId).toBeNull();
    expect(persisted.publishedAt).toBeNull();

    expect(persisted.metadata).toEqual({
      language: 'en',
      nested: {
        value: 1,
      },
    });
  });

  it('rejects an invalid discoveredAt value before querying PostgreSQL', async () => {
    const repository = createArticleRepository(database);

    await expect(
      repository.persist(
        createArticle({
          discoveredAt: new Date('invalid'),
        }),
      ),
    ).rejects.toThrow('Article discoveredAt must be a valid Date.');
  });

  it('lists recently published articles newest first', async () => {
    const repository = createArticleRepository(database);

    await repository.persist(
      createArticle({
        canonicalUrl: `${testUrlPrefix}older`,
        url: `${testUrlPrefix}older`,
        externalId: 'older',
        publishedAt: new Date('2026-08-27T12:00:00.000Z'),
      }),
    );

    await repository.persist(
      createArticle({
        canonicalUrl: `${testUrlPrefix}newer`,
        url: `${testUrlPrefix}newer`,
        externalId: 'newer',
        publishedAt: new Date('2026-08-27T14:00:00.000Z'),
      }),
    );

    const articles = await repository.listRecent({
      limit: 100,
    });

    const integrationArticles = articles.filter((article) =>
      article.canonicalUrl.startsWith(testUrlPrefix),
    );

    expect(integrationArticles.map((article) => article.canonicalUrl)).toEqual([
      `${testUrlPrefix}newer`,
      `${testUrlPrefix}older`,
    ]);
  });

  it('respects the recent article limit', async () => {
    const repository = createArticleRepository(database);

    await Promise.all([
      repository.persist(
        createArticle({
          canonicalUrl: `${testUrlPrefix}1`,
          url: `${testUrlPrefix}1`,
          externalId: '1',
        }),
      ),

      repository.persist(
        createArticle({
          canonicalUrl: `${testUrlPrefix}2`,
          url: `${testUrlPrefix}2`,
          externalId: '2',
        }),
      ),
    ]);

    const articles = await repository.listRecent({
      limit: 1,
    });

    expect(articles).toHaveLength(1);
  });

  it('rejects an invalid recent article limit', async () => {
    const repository = createArticleRepository(database);

    await expect(
      repository.listRecent({
        limit: 0,
      }),
    ).rejects.toThrow('Article list limit must be an integer between 1 and 100.');
  });
});

function createArticle(overrides: Partial<NormalizedArticle> = {}): NormalizedArticle {
  return {
    title: 'Example article',

    url: `${testUrlPrefix}article`,
    canonicalUrl: `${testUrlPrefix}article`,

    source: {
      id: 'gnews',
      name: 'GNews',
      type: 'api',
    },

    publisher: {
      id: 'publisher-1',
      name: 'Example Publisher',
    },

    externalId: 'external-1',

    publishedAt: new Date('2026-08-25T11:00:00.000Z'),

    discoveredAt: new Date('2026-08-25T12:00:00.000Z'),

    author: 'Example Author',
    summary: 'Example summary',
    category: 'technology',

    metadata: {
      language: 'en',
    },

    ...overrides,
  };
}

async function cleanup(database: DatabaseClient): Promise<void> {
  await database.article.deleteMany({
    where: {
      canonicalUrl: {
        startsWith: testUrlPrefix,
      },
    },
  });
}
