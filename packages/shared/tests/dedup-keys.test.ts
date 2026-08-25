import { describe, expect, it } from 'vitest';

import {
  createArticleDedupKeys,
  normalizeTitleForDedup,
  type NormalizedArticle,
} from '../src/news/index.js';

function createArticle(overrides: Partial<NormalizedArticle> = {}): NormalizedArticle {
  return {
    title: 'Example Headline',

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

    externalId: 'article-123',

    publishedAt: new Date('2026-08-25T16:00:00.000Z'),

    discoveredAt: new Date('2026-08-25T16:30:00.000Z'),

    author: null,
    summary: null,
    category: null,
    metadata: null,

    ...overrides,
  };
}

describe('article dedup keys', () => {
  it('creates source-scoped external ID key', () => {
    const keys = createArticleDedupKeys(createArticle());

    expect(keys[0]).toEqual({
      type: 'source-external-id',
      value: 'gnews:article-123',
    });
  });

  it('creates canonical URL key', () => {
    const keys = createArticleDedupKeys(createArticle());

    expect(keys).toContainEqual({
      type: 'canonical-url',
      value: 'https://example.com/article',
    });
  });

  it('creates publisher-title key', () => {
    const keys = createArticleDedupKeys(createArticle());

    expect(keys).toContainEqual({
      type: 'publisher-title',
      value: 'example publisher:example headline',
    });
  });

  it('omits external ID key when externalId is null', () => {
    const keys = createArticleDedupKeys(
      createArticle({
        externalId: null,
      }),
    );

    expect(keys.some((key) => key.type === 'source-external-id')).toBe(false);
  });

  it('omits publisher-title key when publisher is missing', () => {
    const keys = createArticleDedupKeys(
      createArticle({
        publisher: null,
      }),
    );

    expect(keys.some((key) => key.type === 'publisher-title')).toBe(false);
  });

  it('normalizes title case and whitespace', () => {
    expect(normalizeTitleForDedup('  BREAKING   News\nHeadline ')).toBe('breaking news headline');
  });

  it('normalizes Unicode compatibility forms', () => {
    expect(normalizeTitleForDedup('ＦＯＯ')).toBe('foo');
  });

  it('does not remove punctuation from titles', () => {
    expect(normalizeTitleForDedup('Market falls!')).not.toBe(
      normalizeTitleForDedup('Market falls'),
    );
  });
});
