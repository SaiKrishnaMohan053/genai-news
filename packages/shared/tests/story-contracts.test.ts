import { describe, expect, it } from 'vitest';

import {
  INITIAL_STORY_CLUSTERING_VERSION,
  STORY_MATCH_DECISIONS,
  type CanonicalStory,
  type StoryArticleMembership,
  type StoryMatchDecision,
} from '../src/index.js';

describe('story domain contracts', () => {
  it('exposes the initial stable clustering version', () => {
    expect(INITIAL_STORY_CLUSTERING_VERSION).toBe('story-clustering-v1');
  });

  it('exposes explicit match decision values', () => {
    expect(STORY_MATCH_DECISIONS).toEqual(['match', 'no-match']);
  });

  it('supports a provider-neutral canonical story', () => {
    const story: CanonicalStory = {
      id: 'story-1',
      canonicalTitle: 'OpenAI releases Model X',
      firstPublishedAt: new Date('2026-08-31T10:00:00.000Z'),
      lastPublishedAt: new Date('2026-08-31T11:00:00.000Z'),
    };

    expect(story.id).toBe('story-1');
    expect(story.canonicalTitle).toBe('OpenAI releases Model X');
  });

  it('represents an explainable match decision without fixing signal names', () => {
    const decision: StoryMatchDecision = {
      decision: 'match',
      score: 0.8,
      signals: {
        exampleSignal: 0.8,
      },
      reason: 'Candidate satisfied the current clustering policy.',
      clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
    };

    expect(decision.decision).toBe('match');
    expect(decision.signals.exampleSignal).toBe(0.8);
  });

  it('distinguishes seed membership from matched membership', () => {
    const seed: StoryArticleMembership = {
      storyId: 'story-1',
      articleId: 'article-1',
      provenance: {
        kind: 'seed',
        clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
      },
    };

    const matched: StoryArticleMembership = {
      storyId: 'story-1',
      articleId: 'article-2',
      provenance: {
        kind: 'matched',
        decision: {
          decision: 'match',
          score: 0.8,
          signals: {
            exampleSignal: 0.8,
          },
          reason: 'Candidate satisfied the current clustering policy.',
          clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
        },
      },
    };

    expect(seed.provenance.kind).toBe('seed');
    expect(matched.provenance.kind).toBe('matched');
  });
});
