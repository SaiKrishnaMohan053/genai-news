import { describe, expect, it } from 'vitest';

import {
  extractStoryFeatures,
  generateStoryCandidates,
  type StoryCandidate,
  type StoryCandidateGenerationPolicy,
} from '../src/index.js';

const HOUR_MS = 60 * 60 * 1000;

const policy: StoryCandidateGenerationPolicy = {
  maxTimeDistanceMs: 2 * HOUR_MS,
  includeWhenTimeUnknown: true,
};

function createIncomingArticle(publishedAt: Date | null) {
  return extractStoryFeatures({
    id: 'article-new',
    title: 'Northstar AI launches Atlas One',
    publishedAt,
    publisherName: 'Global Wire',
  });
}

describe('story candidate generation', () => {
  it('includes a story when the article timestamp overlaps the story interval', () => {
    const article = createIncomingArticle(new Date('2026-08-31T10:30:00.000Z'));

    const stories: StoryCandidate[] = [
      {
        storyId: 'story-1',
        firstPublishedAt: new Date('2026-08-31T10:00:00.000Z'),
        lastPublishedAt: new Date('2026-08-31T11:00:00.000Z'),
      },
    ];

    const result = generateStoryCandidates({
      article,
      stories,
      policy,
    });

    expect(result.candidates).toEqual(stories);

    expect(result.decisions).toEqual([
      {
        storyId: 'story-1',
        included: true,
        reason: 'time-overlap',
        timeDistanceMs: 0,
      },
    ]);
  });

  it('includes a story within the configured future-side time window', () => {
    const article = createIncomingArticle(new Date('2026-08-31T12:30:00.000Z'));

    const result = generateStoryCandidates({
      article,
      stories: [
        {
          storyId: 'story-1',
          firstPublishedAt: new Date('2026-08-31T10:00:00.000Z'),
          lastPublishedAt: new Date('2026-08-31T11:00:00.000Z'),
        },
      ],
      policy,
    });

    expect(result.decisions[0]).toEqual({
      storyId: 'story-1',
      included: true,
      reason: 'within-time-window',
      timeDistanceMs: 90 * 60 * 1000,
    });
  });

  it('includes a story within the configured past-side time window', () => {
    const article = createIncomingArticle(new Date('2026-08-31T08:30:00.000Z'));

    const result = generateStoryCandidates({
      article,
      stories: [
        {
          storyId: 'story-1',
          firstPublishedAt: new Date('2026-08-31T10:00:00.000Z'),
          lastPublishedAt: new Date('2026-08-31T11:00:00.000Z'),
        },
      ],
      policy,
    });

    expect(result.decisions[0]).toEqual({
      storyId: 'story-1',
      included: true,
      reason: 'within-time-window',
      timeDistanceMs: 90 * 60 * 1000,
    });
  });

  it('includes an article exactly at the time-window boundary', () => {
    const article = createIncomingArticle(new Date('2026-08-31T13:00:00.000Z'));

    const result = generateStoryCandidates({
      article,
      stories: [
        {
          storyId: 'story-1',
          firstPublishedAt: new Date('2026-08-31T10:00:00.000Z'),
          lastPublishedAt: new Date('2026-08-31T11:00:00.000Z'),
        },
      ],
      policy,
    });

    expect(result.candidateCount).toBe(1);

    expect(result.decisions[0]?.timeDistanceMs).toBe(2 * HOUR_MS);
  });

  it('excludes an article one millisecond outside the configured window', () => {
    const article = createIncomingArticle(
      new Date(new Date('2026-08-31T13:00:00.000Z').getTime() + 1),
    );

    const result = generateStoryCandidates({
      article,
      stories: [
        {
          storyId: 'story-1',
          firstPublishedAt: new Date('2026-08-31T10:00:00.000Z'),
          lastPublishedAt: new Date('2026-08-31T11:00:00.000Z'),
        },
      ],
      policy,
    });

    expect(result.candidates).toEqual([]);

    expect(result.decisions[0]).toEqual({
      storyId: 'story-1',
      included: false,
      reason: 'outside-time-window',
      timeDistanceMs: 2 * HOUR_MS + 1,
    });
  });

  it('conservatively includes unknown article publication time when configured', () => {
    const result = generateStoryCandidates({
      article: createIncomingArticle(null),

      stories: [
        {
          storyId: 'story-1',
          firstPublishedAt: new Date('2026-08-31T10:00:00.000Z'),
          lastPublishedAt: new Date('2026-08-31T11:00:00.000Z'),
        },
      ],

      policy: {
        maxTimeDistanceMs: HOUR_MS,
        includeWhenTimeUnknown: true,
      },
    });

    expect(result.decisions[0]).toEqual({
      storyId: 'story-1',
      included: true,
      reason: 'time-unknown',
      timeDistanceMs: null,
    });
  });

  it('can exclude unknown publication time when policy requires it', () => {
    const result = generateStoryCandidates({
      article: createIncomingArticle(null),

      stories: [
        {
          storyId: 'story-1',
          firstPublishedAt: new Date('2026-08-31T10:00:00.000Z'),
          lastPublishedAt: new Date('2026-08-31T11:00:00.000Z'),
        },
      ],

      policy: {
        maxTimeDistanceMs: HOUR_MS,
        includeWhenTimeUnknown: false,
      },
    });

    expect(result.candidateCount).toBe(0);

    expect(result.decisions[0]?.reason).toBe('time-unknown');
  });

  it('treats an incomplete story time envelope as unknown', () => {
    const result = generateStoryCandidates({
      article: createIncomingArticle(new Date('2026-08-31T10:30:00.000Z')),

      stories: [
        {
          storyId: 'story-1',
          firstPublishedAt: new Date('2026-08-31T10:00:00.000Z'),
          lastPublishedAt: null,
        },
      ],

      policy,
    });

    expect(result.decisions[0]).toEqual({
      storyId: 'story-1',
      included: true,
      reason: 'time-unknown',
      timeDistanceMs: null,
    });
  });

  it('preserves candidate input order and does not rank stories', () => {
    const article = createIncomingArticle(new Date('2026-08-31T10:30:00.000Z'));

    const stories: StoryCandidate[] = [
      {
        storyId: 'story-b',
        firstPublishedAt: new Date('2026-08-31T10:00:00.000Z'),
        lastPublishedAt: new Date('2026-08-31T10:10:00.000Z'),
      },
      {
        storyId: 'story-a',
        firstPublishedAt: new Date('2026-08-31T10:20:00.000Z'),
        lastPublishedAt: new Date('2026-08-31T10:25:00.000Z'),
      },
    ];

    const result = generateStoryCandidates({
      article,
      stories,
      policy,
    });

    expect(result.candidates.map((story) => story.storyId)).toEqual(['story-b', 'story-a']);
  });

  it('reports aggregate candidate volume', () => {
    const article = createIncomingArticle(new Date('2026-08-31T10:00:00.000Z'));

    const result = generateStoryCandidates({
      article,

      stories: [
        {
          storyId: 'near',
          firstPublishedAt: new Date('2026-08-31T09:30:00.000Z'),
          lastPublishedAt: new Date('2026-08-31T09:45:00.000Z'),
        },

        {
          storyId: 'far',
          firstPublishedAt: new Date('2026-08-30T01:00:00.000Z'),
          lastPublishedAt: new Date('2026-08-30T02:00:00.000Z'),
        },
      ],

      policy,
    });

    expect(result.totalStories).toBe(2);
    expect(result.candidateCount).toBe(1);
    expect(result.excludedCount).toBe(1);
  });

  it('returns an empty deterministic result when there are no stories', () => {
    const result = generateStoryCandidates({
      article: createIncomingArticle(new Date('2026-08-31T10:00:00.000Z')),

      stories: [],

      policy,
    });

    expect(result).toEqual({
      candidates: [],
      decisions: [],
      totalStories: 0,
      candidateCount: 0,
      excludedCount: 0,
    });
  });

  it('rejects a negative candidate time window', () => {
    expect(() =>
      generateStoryCandidates({
        article: createIncomingArticle(new Date('2026-08-31T10:00:00.000Z')),

        stories: [],

        policy: {
          maxTimeDistanceMs: -1,
          includeWhenTimeUnknown: true,
        },
      }),
    ).toThrow('Story candidate maxTimeDistanceMs must be a finite non-negative number.');
  });

  it('rejects duplicate story ids', () => {
    expect(() =>
      generateStoryCandidates({
        article: createIncomingArticle(new Date('2026-08-31T10:00:00.000Z')),

        stories: [
          {
            storyId: 'story-1',
            firstPublishedAt: null,
            lastPublishedAt: null,
          },
          {
            storyId: 'story-1',
            firstPublishedAt: null,
            lastPublishedAt: null,
          },
        ],

        policy,
      }),
    ).toThrow('Duplicate candidate story id: story-1');
  });

  it('rejects an invalid story publication interval', () => {
    expect(() =>
      generateStoryCandidates({
        article: createIncomingArticle(new Date('2026-08-31T10:00:00.000Z')),

        stories: [
          {
            storyId: 'story-1',
            firstPublishedAt: new Date('2026-08-31T12:00:00.000Z'),
            lastPublishedAt: new Date('2026-08-31T11:00:00.000Z'),
          },
        ],

        policy,
      }),
    ).toThrow('Candidate story story-1 firstPublishedAt must not be after lastPublishedAt.');
  });

  it('does not mutate candidate stories', () => {
    const stories: StoryCandidate[] = [
      {
        storyId: 'story-1',
        firstPublishedAt: new Date('2026-08-31T10:00:00.000Z'),
        lastPublishedAt: new Date('2026-08-31T11:00:00.000Z'),
      },
    ];

    const beforeFirst = stories[0]?.firstPublishedAt?.getTime();

    const beforeLast = stories[0]?.lastPublishedAt?.getTime();

    generateStoryCandidates({
      article: createIncomingArticle(new Date('2026-08-31T10:30:00.000Z')),
      stories,
      policy,
    });

    expect(stories[0]?.firstPublishedAt?.getTime()).toBe(beforeFirst);

    expect(stories[0]?.lastPublishedAt?.getTime()).toBe(beforeLast);
  });

  it('returns identical candidate decisions across repeated runs', () => {
    const article = createIncomingArticle(new Date('2026-08-31T10:30:00.000Z'));

    const stories: StoryCandidate[] = [
      {
        storyId: 'story-1',
        firstPublishedAt: new Date('2026-08-31T10:00:00.000Z'),
        lastPublishedAt: new Date('2026-08-31T11:00:00.000Z'),
      },
    ];

    const first = generateStoryCandidates({
      article,
      stories,
      policy,
    });

    const second = generateStoryCandidates({
      article,
      stories,
      policy,
    });

    expect(first).toEqual(second);
  });
});
