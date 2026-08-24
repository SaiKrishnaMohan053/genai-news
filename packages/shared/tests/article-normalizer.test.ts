import { describe, expect, it } from 'vitest';

import { normalizeSourceArticle } from '../src/news/index.js';

const source = {
  id: 'gnews',
  name: 'GNews',
  type: 'api',
} as const;

const discoveredAt = new Date('2026-08-24T20:00:00.000Z');

describe('normalizeSourceArticle', () => {
  it('normalizes a valid source article', () => {
    const result = normalizeSourceArticle({
      source,
      discoveredAt,
      article: {
        externalId: ' article-123 ',
        title: '  Example   headline ',
        url: 'https://EXAMPLE.com/story?id=42&utm_source=test#section',
        publishedAt: '2026-08-24T18:00:00Z',
        author: '  Example   Author ',
        summary: ' Example   summary ',
        category: ' technology ',
        publisher: {
          id: ' publisher-1 ',
          name: ' Example Publisher ',
        },
        metadata: {
          language: 'en',
        },
      },
    });

    expect(result.status).toBe('accepted');

    if (result.status !== 'accepted') {
      throw new Error('Expected article to be accepted.');
    }

    expect(result.article).toEqual({
      title: 'Example headline',
      url: 'https://example.com/story?id=42&utm_source=test',
      canonicalUrl: 'https://example.com/story?id=42',

      source,

      publisher: {
        id: 'publisher-1',
        name: 'Example Publisher',
      },

      externalId: 'article-123',

      publishedAt: new Date('2026-08-24T18:00:00.000Z'),
      discoveredAt,

      author: 'Example Author',
      summary: 'Example summary',
      category: 'technology',

      metadata: {
        language: 'en',
      },
    });
  });

  it('accepts a missing publication timestamp as null', () => {
    const result = normalizeSourceArticle({
      source,
      discoveredAt,
      article: {
        title: 'Example headline',
        url: 'https://example.com/story',
      },
    });

    expect(result.status).toBe('accepted');

    if (result.status === 'accepted') {
      expect(result.article.publishedAt).toBeNull();
    }
  });

  it('rejects an invalid publication timestamp', () => {
    expect(
      normalizeSourceArticle({
        source,
        discoveredAt,
        article: {
          title: 'Example headline',
          url: 'https://example.com/story',
          publishedAt: 'not-a-timestamp',
        },
      }),
    ).toEqual({
      status: 'rejected',
      reason: 'invalid-published-at',
    });
  });

  it('rejects a missing title', () => {
    expect(
      normalizeSourceArticle({
        source,
        discoveredAt,
        article: {
          url: 'https://example.com/story',
        },
      }),
    ).toEqual({
      status: 'rejected',
      reason: 'missing-title',
    });
  });

  it('rejects a blank title', () => {
    expect(
      normalizeSourceArticle({
        source,
        discoveredAt,
        article: {
          title: '   ',
          url: 'https://example.com/story',
        },
      }),
    ).toEqual({
      status: 'rejected',
      reason: 'missing-title',
    });
  });

  it('rejects a missing URL', () => {
    expect(
      normalizeSourceArticle({
        source,
        discoveredAt,
        article: {
          title: 'Example headline',
        },
      }),
    ).toEqual({
      status: 'rejected',
      reason: 'missing-url',
    });
  });

  it('rejects an invalid URL', () => {
    expect(
      normalizeSourceArticle({
        source,
        discoveredAt,
        article: {
          title: 'Example headline',
          url: 'not-a-url',
        },
      }),
    ).toEqual({
      status: 'rejected',
      reason: 'invalid-url',
    });
  });

  it('rejects structurally invalid source article input', () => {
    expect(
      normalizeSourceArticle({
        source,
        discoveredAt,
        article: {
          title: 123,
          url: 'https://example.com/story',
        },
      }),
    ).toEqual({
      status: 'rejected',
      reason: 'invalid-article-shape',
    });
  });

  it('rejects invalid source identity', () => {
    expect(
      normalizeSourceArticle({
        source: {
          id: '',
          name: 'GNews',
          type: 'api',
        },
        discoveredAt,
        article: {
          title: 'Example headline',
          url: 'https://example.com/story',
        },
      }),
    ).toEqual({
      status: 'rejected',
      reason: 'invalid-source',
    });
  });

  it('normalizes missing optional fields to null', () => {
    const result = normalizeSourceArticle({
      source,
      discoveredAt,
      article: {
        title: 'Example headline',
        url: 'https://example.com/story',
      },
    });

    expect(result.status).toBe('accepted');

    if (result.status !== 'accepted') {
      throw new Error('Expected article to be accepted.');
    }

    expect(result.article.externalId).toBeNull();
    expect(result.article.publisher).toBeNull();
    expect(result.article.author).toBeNull();
    expect(result.article.summary).toBeNull();
    expect(result.article.category).toBeNull();
    expect(result.article.metadata).toBeNull();
  });

  it('does not reject a future timestamp during normalization', () => {
    const result = normalizeSourceArticle({
      source,
      discoveredAt,
      article: {
        title: 'Example headline',
        url: 'https://example.com/story',
        publishedAt: '2030-01-01T00:00:00Z',
      },
    });

    expect(result.status).toBe('accepted');
  });

  it('throws when injected discoveredAt is invalid', () => {
    expect(() =>
      normalizeSourceArticle({
        source,
        discoveredAt: new Date('invalid'),
        article: {
          title: 'Example headline',
          url: 'https://example.com/story',
        },
      }),
    ).toThrow('discoveredAt must be a valid Date.');
  });
});
