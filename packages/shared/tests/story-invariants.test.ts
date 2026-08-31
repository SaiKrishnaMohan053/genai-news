import { describe, expect, it } from 'vitest';

import {
  INITIAL_STORY_CLUSTERING_VERSION,
  assertCanonicalStory,
  assertStoryArticleMembership,
  assertStoryMatchDecision,
  type CanonicalStory,
  type StoryArticleMembership,
  type StoryMatchDecision,
} from '../src/index.js';

describe('story domain invariants', () => {
  it('accepts a valid canonical story', () => {
    const story: CanonicalStory = {
      id: 'story-1',
      canonicalTitle: 'OpenAI releases Model X',
      firstPublishedAt: new Date('2026-08-31T10:00:00.000Z'),
      lastPublishedAt: new Date('2026-08-31T11:00:00.000Z'),
    };

    expect(() => assertCanonicalStory(story)).not.toThrow();
  });

  it('rejects an empty story id', () => {
    expect(() =>
      assertCanonicalStory({
        id: '   ',
        canonicalTitle: 'Valid title',
        firstPublishedAt: null,
        lastPublishedAt: null,
      }),
    ).toThrow('Story id must be a non-empty string.');
  });

  it('rejects an empty canonical title', () => {
    expect(() =>
      assertCanonicalStory({
        id: 'story-1',
        canonicalTitle: '   ',
        firstPublishedAt: null,
        lastPublishedAt: null,
      }),
    ).toThrow('Story canonicalTitle must be a non-empty string.');
  });

  it('rejects an invalid publication range', () => {
    expect(() =>
      assertCanonicalStory({
        id: 'story-1',
        canonicalTitle: 'Valid title',
        firstPublishedAt: new Date('2026-08-31T12:00:00.000Z'),
        lastPublishedAt: new Date('2026-08-31T11:00:00.000Z'),
      }),
    ).toThrow('Story firstPublishedAt must not be after lastPublishedAt.');
  });

  it('accepts a valid explainable match decision', () => {
    const decision: StoryMatchDecision = {
      decision: 'match',
      score: 0.75,
      signals: {
        signalA: 0.8,
        signalB: 0.7,
      },
      reason: 'Candidate satisfied the current clustering policy.',
      clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
    };

    expect(() => assertStoryMatchDecision(decision)).not.toThrow();
  });

  it('rejects a match score below zero', () => {
    expect(() =>
      assertStoryMatchDecision({
        decision: 'no-match',
        score: -0.01,
        signals: {},
        reason: 'Insufficient evidence.',
        clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
      }),
    ).toThrow('Story match score must be a finite number between 0 and 1.');
  });

  it('rejects a match score above one', () => {
    expect(() =>
      assertStoryMatchDecision({
        decision: 'match',
        score: 1.01,
        signals: {},
        reason: 'Invalid score.',
        clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
      }),
    ).toThrow('Story match score must be a finite number between 0 and 1.');
  });

  it('rejects invalid signal scores', () => {
    expect(() =>
      assertStoryMatchDecision({
        decision: 'match',
        score: 0.8,
        signals: {
          invalidSignal: Number.NaN,
        },
        reason: 'Invalid signal.',
        clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
      }),
    ).toThrow('Story match signal "invalidSignal" must be a finite number between 0 and 1.');
  });

  it('accepts seed membership without a fabricated similarity decision', () => {
    const membership: StoryArticleMembership = {
      storyId: 'story-1',
      articleId: 'article-1',
      provenance: {
        kind: 'seed',
        clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
      },
    };

    expect(() => assertStoryArticleMembership(membership)).not.toThrow();
  });

  it('accepts matched membership only with a positive match decision', () => {
    const membership: StoryArticleMembership = {
      storyId: 'story-1',
      articleId: 'article-2',
      provenance: {
        kind: 'matched',
        decision: {
          decision: 'match',
          score: 0.8,
          signals: {
            signalA: 0.8,
          },
          reason: 'Candidate satisfied the current clustering policy.',
          clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
        },
      },
    };

    expect(() => assertStoryArticleMembership(membership)).not.toThrow();
  });

  it('rejects matched membership containing a no-match decision', () => {
    expect(() =>
      assertStoryArticleMembership({
        storyId: 'story-1',
        articleId: 'article-2',
        provenance: {
          kind: 'matched',
          decision: {
            decision: 'no-match',
            score: 0.2,
            signals: {
              signalA: 0.2,
            },
            reason: 'Candidate did not satisfy the current clustering policy.',
            clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
          },
        },
      }),
    ).toThrow('Matched story membership must contain a positive match decision.');
  });
});
