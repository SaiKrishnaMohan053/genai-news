import type { DatabaseClient } from '@genai-news/database';

import type { StoryArticleId } from '@genai-news/shared';

import { describe, expect, it, vi } from 'vitest';

import { createDatabaseStoryCandidateProvider } from '../src/news/story-clustering/index.js';

function articleId(value: string): StoryArticleId {
  return value as StoryArticleId;
}

describe('database story candidate provider', () => {
  it('returns only stories inside the temporal candidate window', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'story-near',

          firstPublishedAt: new Date('2026-09-01T09:00:00.000Z'),

          lastPublishedAt: new Date('2026-09-01T10:00:00.000Z'),
        },

        {
          id: 'story-far',

          firstPublishedAt: new Date('2026-08-20T09:00:00.000Z'),

          lastPublishedAt: new Date('2026-08-20T10:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'story-near',

          representativeArticle: {
            id: 'rep-near',

            title: 'Nearby representative',

            publishedAt: new Date('2026-09-01T09:30:00.000Z'),
          },
        },
      ]);

    const database = {
      story: {
        findMany,
      },
    } as unknown as DatabaseClient;

    const provider = createDatabaseStoryCandidateProvider({
      database,

      policy: {
        maxTimeDistanceMs: 2 * 60 * 60 * 1000,

        includeWhenTimeUnknown: false,
      },
    });

    const result = await provider.findCandidates({
      id: articleId('article-a'),

      title: 'Incoming story',

      publishedAt: new Date('2026-09-01T11:00:00.000Z'),
    });

    expect(result).toEqual([
      {
        storyId: 'story-near',

        representativeArticle: {
          id: 'rep-near',

          title: 'Nearby representative',

          publishedAt: new Date('2026-09-01T09:30:00.000Z'),
        },
      },
    ]);

    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('does not load representatives when no story survives candidate generation', async () => {
    const findMany = vi.fn().mockResolvedValueOnce([
      {
        id: 'story-far',

        firstPublishedAt: new Date('2026-08-01T10:00:00.000Z'),

        lastPublishedAt: new Date('2026-08-01T11:00:00.000Z'),
      },
    ]);

    const database = {
      story: {
        findMany,
      },
    } as unknown as DatabaseClient;

    const provider = createDatabaseStoryCandidateProvider({
      database,

      policy: {
        maxTimeDistanceMs: 60 * 60 * 1000,

        includeWhenTimeUnknown: false,
      },
    });

    const result = await provider.findCandidates({
      id: articleId('article-a'),

      title: 'Incoming story',

      publishedAt: new Date('2026-09-01T10:00:00.000Z'),
    });

    expect(result).toEqual([]);

    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('includes unknown-time stories when policy allows them', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'story-time-unknown',

          firstPublishedAt: null,

          lastPublishedAt: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'story-time-unknown',

          representativeArticle: {
            id: 'rep-time-unknown',

            title: 'Unknown time representative',

            publishedAt: null,
          },
        },
      ]);

    const database = {
      story: {
        findMany,
      },
    } as unknown as DatabaseClient;

    const provider = createDatabaseStoryCandidateProvider({
      database,

      policy: {
        maxTimeDistanceMs: 60 * 60 * 1000,

        includeWhenTimeUnknown: true,
      },
    });

    const result = await provider.findCandidates({
      id: articleId('article-a'),

      title: 'Incoming story',

      publishedAt: new Date('2026-09-01T10:00:00.000Z'),
    });

    expect(result).toHaveLength(1);

    expect(result[0]?.storyId).toBe('story-time-unknown');
  });

  it('preserves deterministic candidate ordering', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'story-a',

          firstPublishedAt: new Date('2026-09-01T09:00:00.000Z'),

          lastPublishedAt: new Date('2026-09-01T09:30:00.000Z'),
        },

        {
          id: 'story-b',

          firstPublishedAt: new Date('2026-09-01T09:00:00.000Z'),

          lastPublishedAt: new Date('2026-09-01T09:30:00.000Z'),
        },
      ])
      /**
       * Deliberately reverse database response.
       */
      .mockResolvedValueOnce([
        {
          id: 'story-b',

          representativeArticle: {
            id: 'rep-b',
            title: 'Representative B',
            publishedAt: null,
          },
        },

        {
          id: 'story-a',

          representativeArticle: {
            id: 'rep-a',
            title: 'Representative A',
            publishedAt: null,
          },
        },
      ]);

    const database = {
      story: {
        findMany,
      },
    } as unknown as DatabaseClient;

    const provider = createDatabaseStoryCandidateProvider({
      database,

      policy: {
        maxTimeDistanceMs: 2 * 60 * 60 * 1000,

        includeWhenTimeUnknown: false,
      },
    });

    const result = await provider.findCandidates({
      id: articleId('article-a'),

      title: 'Incoming story',

      publishedAt: new Date('2026-09-01T10:00:00.000Z'),
    });

    expect(result.map((candidate) => candidate.storyId)).toEqual(['story-a', 'story-b']);
  });

  it('fails if an included story representative cannot be resolved', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'story-missing-rep',

          firstPublishedAt: new Date('2026-09-01T09:00:00.000Z'),

          lastPublishedAt: new Date('2026-09-01T10:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([]);

    const database = {
      story: {
        findMany,
      },
    } as unknown as DatabaseClient;

    const provider = createDatabaseStoryCandidateProvider({
      database,

      policy: {
        maxTimeDistanceMs: 2 * 60 * 60 * 1000,

        includeWhenTimeUnknown: false,
      },
    });

    await expect(
      provider.findCandidates({
        id: articleId('article-a'),

        title: 'Incoming story',

        publishedAt: new Date('2026-09-01T11:00:00.000Z'),
      }),
    ).rejects.toThrow(
      'Candidate story representative could not be resolved. storyId=story-missing-rep',
    );
  });
});
