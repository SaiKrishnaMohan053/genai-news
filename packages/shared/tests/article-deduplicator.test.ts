import { describe, expect, it } from 'vitest';

import { deduplicateArticles, type NormalizedArticle } from '../src/news/index.js';

function createArticle(id: string, overrides: Partial<NormalizedArticle> = {}): NormalizedArticle {
  return {
    title: `Headline ${id}`,

    url: `https://example.com/${id}`,
    canonicalUrl: `https://example.com/${id}`,

    source: {
      id: 'gnews',
      name: 'GNews',
      type: 'api',
    },

    publisher: {
      name: 'Example Publisher',
    },

    externalId: id,

    publishedAt: new Date('2026-08-25T16:00:00.000Z'),

    discoveredAt: new Date('2026-08-25T16:30:00.000Z'),

    author: null,
    summary: null,
    category: null,
    metadata: null,

    ...overrides,
  };
}

describe('deduplicateArticles', () => {
  it('keeps distinct articles', () => {
    const articles = [createArticle('1'), createArticle('2')];

    const result = deduplicateArticles(articles);

    expect(result.uniqueArticles).toHaveLength(2);
    expect(result.duplicates).toHaveLength(0);
  });

  it('deduplicates the same source external ID', () => {
    const first = createArticle('same');

    const second = createArticle('same', {
      canonicalUrl: 'https://other.example.com/story',
      url: 'https://other.example.com/story',
      title: 'Completely different title',
    });

    const result = deduplicateArticles([first, second]);

    expect(result.uniqueArticles).toEqual([first]);

    expect(result.duplicates[0]).toMatchObject({
      duplicateIndex: 1,
      originalIndex: 0,
      reason: 'source-external-id',
    });
  });

  it('does not treat the same external ID from different sources as identical', () => {
    const first = createArticle('same', {
      source: {
        id: 'gnews',
        name: 'GNews',
        type: 'api',
      },
    });

    const second = createArticle('same', {
      source: {
        id: 'rss-feed',
        name: 'RSS Feed',
        type: 'rss',
      },

      canonicalUrl: 'https://different.example.com/story',
      url: 'https://different.example.com/story',

      publisher: {
        name: 'Different Publisher',
      },

      title: 'Different headline',
    });

    const result = deduplicateArticles([first, second]);

    expect(result.uniqueArticles).toHaveLength(2);
  });

  it('deduplicates identical canonical URLs', () => {
    const first = createArticle('1');

    const second = createArticle('2', {
      canonicalUrl: first.canonicalUrl,
    });

    const result = deduplicateArticles([first, second]);

    expect(result.uniqueArticles).toEqual([first]);

    expect(result.duplicates[0]).toMatchObject({
      reason: 'canonical-url',
      originalIndex: 0,
      duplicateIndex: 1,
    });
  });

  it('deduplicates same normalized title from same publisher', () => {
    const first = createArticle('1', {
      title: 'Breaking News Headline',
    });

    const second = createArticle('2', {
      title: '  BREAKING   news headline ',
      canonicalUrl: 'https://another.example.com/2',
      url: 'https://another.example.com/2',
    });

    const result = deduplicateArticles([first, second]);

    expect(result.uniqueArticles).toEqual([first]);

    expect(result.duplicates[0]).toMatchObject({
      reason: 'publisher-title',
    });
  });

  it('keeps identical titles from different publishers', () => {
    const first = createArticle('1', {
      title: 'Markets fall',
      publisher: {
        name: 'Publisher A',
      },
    });

    const second = createArticle('2', {
      title: 'Markets fall',
      publisher: {
        name: 'Publisher B',
      },
    });

    const result = deduplicateArticles([first, second]);

    expect(result.uniqueArticles).toHaveLength(2);
    expect(result.duplicates).toHaveLength(0);
  });

  it('keeps punctuation-different titles when no stronger key matches', () => {
    const first = createArticle('1', {
      title: 'Markets fall!',
    });

    const second = createArticle('2', {
      title: 'Markets fall',
    });

    const result = deduplicateArticles([first, second]);

    expect(result.uniqueArticles).toHaveLength(2);
  });

  it('uses the first occurrence as the representative', () => {
    const first = createArticle('1');

    const second = createArticle('2', {
      canonicalUrl: first.canonicalUrl,
    });

    const third = createArticle('3', {
      canonicalUrl: first.canonicalUrl,
    });

    const result = deduplicateArticles([first, second, third]);

    expect(result.uniqueArticles).toEqual([first]);
    expect(result.duplicates).toHaveLength(2);

    expect(result.duplicates.map((duplicate) => duplicate.originalIndex)).toEqual([0, 0]);
  });

  it('prefers external ID reason over URL reason', () => {
    const first = createArticle('same');

    const second = createArticle('same', {
      canonicalUrl: first.canonicalUrl,
    });

    const result = deduplicateArticles([first, second]);

    expect(result.duplicates[0]?.reason).toBe('source-external-id');
  });

  it('does not propagate keys from duplicate articles transitively', () => {
    const first = createArticle('1', {
      title: 'Original Title',
      publisher: {
        name: 'Publisher A',
      },
    });

    const bridge = createArticle('2', {
      canonicalUrl: first.canonicalUrl,
      title: 'Bridge Title',
      publisher: {
        name: 'Publisher B',
      },
    });

    const third = createArticle('3', {
      title: 'Bridge Title',
      publisher: {
        name: 'Publisher B',
      },
    });

    const result = deduplicateArticles([first, bridge, third]);

    expect(result.uniqueArticles).toEqual([first, third]);

    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0]?.article).toBe(bridge);
  });

  it('handles an empty batch', () => {
    expect(deduplicateArticles([])).toEqual({
      uniqueArticles: [],
      duplicates: [],
    });
  });
});
