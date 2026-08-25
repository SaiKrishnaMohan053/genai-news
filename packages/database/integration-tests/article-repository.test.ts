import type { NormalizedArticle } from '@genai-news/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createArticleRepository, createPrismaClient, type DatabaseClient } from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for database integration tests');
}

describe('article repository integration', () => {
  let database: DatabaseClient;

  beforeAll(() => {
    database = createPrismaClient(databaseUrl);
  });

  beforeEach(async () => {
    await database.article.deleteMany();
  });

  afterAll(async () => {
    await database.article.deleteMany();
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

    expect(await database.article.count()).toBe(1);
  });

  it('is idempotent for repeated canonical URLs', async () => {
    const repository = createArticleRepository(database);

    const article = createArticle();

    const first = await repository.persist(article);

    const second = await repository.persist(article);

    expect(second.id).toBe(first.id);

    expect(await database.article.count()).toBe(1);
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

    expect(await database.article.count()).toBe(1);

    const persisted = await repository.findByCanonicalUrl('https://example.com/article');

    expect(persisted).not.toBeNull();

    expect(persisted?.firstDiscoveredAt).toEqual(new Date('2026-08-25T12:00:00.000Z'));

    expect(persisted?.lastSeenAt).toEqual(new Date('2026-08-25T12:09:00.000Z'));

    expect(persisted?.summary).toBe('version-9');
  });

  it('stores different canonical URLs as different rows', async () => {
    const repository = createArticleRepository(database);

    await repository.persist(
      createArticle({
        canonicalUrl: 'https://example.com/article-1',
        url: 'https://example.com/article-1',
      }),
    );

    await repository.persist(
      createArticle({
        canonicalUrl: 'https://example.com/article-2',
        url: 'https://example.com/article-2',
      }),
    );

    expect(await database.article.count()).toBe(2);
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
});

function createArticle(overrides: Partial<NormalizedArticle> = {}): NormalizedArticle {
  return {
    title: 'Example article',

    url: 'https://example.com/article',
    canonicalUrl: 'https://example.com/article',

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
