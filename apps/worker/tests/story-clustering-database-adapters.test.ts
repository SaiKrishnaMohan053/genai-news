import type { DatabaseClient } from '@genai-news/database';

import { describe, expect, it, vi } from 'vitest';

import { createStoryClusteringArticleReader } from '../src/news/story-clustering/index.js';

describe('story clustering database adapters', () => {
  it('loads the clusterable article projection', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'article-a',

      title: 'Company launches AI platform',

      publishedAt: new Date('2026-09-01T10:00:00.000Z'),
    });

    const database = {
      article: {
        findUnique,
      },
    } as unknown as DatabaseClient;

    const reader = createStoryClusteringArticleReader(database);

    const result = await reader.findById('article-a' as never);

    expect(findUnique).toHaveBeenCalledWith({
      where: {
        id: 'article-a',
      },

      select: {
        id: true,
        title: true,
        publishedAt: true,
      },
    });

    expect(result).toEqual({
      id: 'article-a',

      title: 'Company launches AI platform',

      publishedAt: new Date('2026-09-01T10:00:00.000Z'),
    });
  });

  it('returns null when the article does not exist', async () => {
    const database = {
      article: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    } as unknown as DatabaseClient;

    const reader = createStoryClusteringArticleReader(database);

    await expect(reader.findById('missing' as never)).resolves.toBeNull();
  });
});
