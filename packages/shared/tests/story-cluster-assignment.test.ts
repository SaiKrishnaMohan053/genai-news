import { describe, expect, it } from 'vitest';

import {
  assignArticleToStoryCluster,
  decideStoryMatchV1,
  INITIAL_STORY_CLUSTERING_VERSION,
  type StoryArticleId,
  type StoryId,
  type StoryAssignmentCandidate,
} from '../src/index.js';

function articleId(value: string): StoryArticleId {
  return value as StoryArticleId;
}

function storyId(value: string): StoryId {
  return value as StoryId;
}

function candidate(
  story: string,
  representative: string,
  semanticSimilarity: number,
): StoryAssignmentCandidate {
  return {
    storyId: storyId(story),

    representativeArticleId: articleId(representative),

    decision: decideStoryMatchV1(semanticSimilarity),
  };
}

describe('incremental story cluster assignment', () => {
  it('seeds a new story when candidate generation returns nothing', () => {
    const result = assignArticleToStoryCluster(articleId('article-new'), []);

    expect(result).toEqual({
      kind: 'seed-new-story',

      articleId: 'article-new',

      reason: 'no-candidates',

      consideredCandidateCount: 0,

      matchingCandidateCount: 0,

      matchingStoryIds: [],

      clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
    });
  });

  it('seeds a new story when all candidates are no-match', () => {
    const result = assignArticleToStoryCluster(articleId('article-new'), [
      candidate('story-a', 'article-a', 0.65),

      candidate('story-b', 'article-b', 0.6),
    ]);

    expect(result).toEqual({
      kind: 'seed-new-story',

      articleId: 'article-new',

      reason: 'no-matching-candidates',

      consideredCandidateCount: 2,

      matchingCandidateCount: 0,

      matchingStoryIds: [],

      clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
    });
  });

  it('assigns to exactly one matching story', () => {
    const result = assignArticleToStoryCluster(articleId('article-new'), [
      candidate('story-a', 'article-a', 0.65),

      candidate('story-b', 'article-b', 0.84),

      candidate('story-c', 'article-c', 0.55),
    ]);

    expect(result.kind).toBe('assign-existing-story');

    if (result.kind !== 'assign-existing-story') {
      throw new Error('Expected existing story assignment.');
    }

    expect(result.storyId).toBe('story-b');

    expect(result.representativeArticleId).toBe('article-b');

    expect(result.matchDecision.decision).toBe('match');

    expect(result.matchDecision.score).toBe(0.84);

    expect(result.consideredCandidateCount).toBe(3);

    expect(result.matchingCandidateCount).toBe(1);
  });

  it('does not force assignment when multiple stories independently match', () => {
    const result = assignArticleToStoryCluster(articleId('article-new'), [
      candidate('story-a', 'article-a', 0.85),

      candidate('story-b', 'article-b', 0.81),
    ]);

    expect(result).toEqual({
      kind: 'seed-new-story',

      articleId: 'article-new',

      reason: 'ambiguous-matching-candidates',

      consideredCandidateCount: 2,

      matchingCandidateCount: 2,

      matchingStoryIds: ['story-a', 'story-b'],

      clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
    });
  });

  it('does not select the highest score when multiple matches exist', () => {
    const result = assignArticleToStoryCluster(articleId('article-new'), [
      candidate('story-low', 'article-low', 0.71),

      candidate('story-high', 'article-high', 0.99),
    ]);

    expect(result.kind).toBe('seed-new-story');

    if (result.kind !== 'seed-new-story') {
      throw new Error('Expected conservative new-story assignment.');
    }

    expect(result.reason).toBe('ambiguous-matching-candidates');

    expect(result.matchingCandidateCount).toBe(2);
  });

  it('is stable when candidate input order changes for a unique match', () => {
    const first = assignArticleToStoryCluster(articleId('article-new'), [
      candidate('story-a', 'article-a', 0.64),

      candidate('story-b', 'article-b', 0.82),
    ]);

    const second = assignArticleToStoryCluster(articleId('article-new'), [
      candidate('story-b', 'article-b', 0.82),

      candidate('story-a', 'article-a', 0.64),
    ]);

    expect(first).toEqual(second);
  });

  it('sorts ambiguous matching story ids so output is stable across candidate order', () => {
    const first = assignArticleToStoryCluster(articleId('article-new'), [
      candidate('story-z', 'article-z', 0.8),

      candidate('story-a', 'article-a', 0.9),
    ]);

    const second = assignArticleToStoryCluster(articleId('article-new'), [
      candidate('story-a', 'article-a', 0.9),

      candidate('story-z', 'article-z', 0.8),
    ]);

    expect(first).toEqual(second);

    expect(first.kind).toBe('seed-new-story');

    if (first.kind === 'seed-new-story') {
      expect(first.matchingStoryIds).toEqual(['story-a', 'story-z']);
    }
  });

  it('rejects duplicate candidate story ids', () => {
    expect(() =>
      assignArticleToStoryCluster(articleId('article-new'), [
        candidate('story-a', 'article-a', 0.8),

        candidate('story-a', 'article-b', 0.81),
      ]),
    ).toThrow('Duplicate story assignment candidate: story-a');
  });

  it('rejects an empty article id', () => {
    expect(() => assignArticleToStoryCluster(articleId(''), [])).toThrow(
      'Story assignment article id must be non-empty.',
    );
  });

  it('does not perform transitive clustering', () => {
    /**
     * Existing:
     *
     * A belongs to story-a.
     *
     * New article B matches story-a.
     * That does not mean some unrelated story-c
     * should be pulled into story-a merely because
     * B may resemble C.
     *
     * The assignment algorithm only acts on the
     * explicit candidate decisions supplied for B.
     */
    const result = assignArticleToStoryCluster(articleId('article-b'), [
      candidate('story-a', 'article-a', 0.83),

      candidate('story-c', 'article-c', 0.62),
    ]);

    expect(result.kind).toBe('assign-existing-story');

    if (result.kind === 'assign-existing-story') {
      expect(result.storyId).toBe('story-a');
    }
  });

  it('returns the same result across repeated evaluation', () => {
    const candidates = [
      candidate('story-a', 'article-a', 0.61),

      candidate('story-b', 'article-b', 0.88),
    ];

    const first = assignArticleToStoryCluster(articleId('article-new'), candidates);

    const second = assignArticleToStoryCluster(articleId('article-new'), candidates);

    expect(first).toEqual(second);
  });
});
