import { describe, expect, it } from 'vitest';

import {
  decideStoryMatchV1,
  INITIAL_STORY_CLUSTERING_VERSION,
  STORY_V1_SEMANTIC_MATCH_THRESHOLD,
} from '../src/index.js';

describe('Phase 2 v1 story decision policy', () => {
  it('uses the frozen semantic threshold', () => {
    expect(STORY_V1_SEMANTIC_MATCH_THRESHOLD).toBe(0.7);
  });

  it('matches semantic similarity above the threshold', () => {
    const decision = decideStoryMatchV1(0.85);

    expect(decision).toEqual({
      decision: 'match',

      score: 0.85,

      signals: {
        semanticSimilarity: 0.85,
      },

      reason: 'semantic-similarity-at-or-above-v1-threshold',

      clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
    });
  });

  it('matches exactly at the threshold', () => {
    const decision = decideStoryMatchV1(STORY_V1_SEMANTIC_MATCH_THRESHOLD);

    expect(decision.decision).toBe('match');
  });

  it('does not match immediately below the threshold', () => {
    const decision = decideStoryMatchV1(STORY_V1_SEMANTIC_MATCH_THRESHOLD - Number.EPSILON);

    expect(decision.decision).toBe('no-match');
  });

  it('does not match clearly lower semantic similarity', () => {
    const decision = decideStoryMatchV1(0.5);

    expect(decision.decision).toBe('no-match');

    expect(decision.score).toBe(0.5);
  });

  it('handles negative cosine similarity conservatively', () => {
    const decision = decideStoryMatchV1(-0.25);

    expect(decision.decision).toBe('no-match');

    expect(decision.score).toBe(0);

    expect(decision.signals).toEqual({
      semanticSimilarity: 0,
    });
  });

  it('rejects similarity above cosine bounds', () => {
    expect(() => decideStoryMatchV1(1.01)).toThrow(
      'Semantic similarity must be a finite cosine similarity between -1 and 1.',
    );
  });

  it('rejects similarity below cosine bounds', () => {
    expect(() => decideStoryMatchV1(-1.01)).toThrow(
      'Semantic similarity must be a finite cosine similarity between -1 and 1.',
    );
  });

  it('rejects non-finite similarity', () => {
    expect(() => decideStoryMatchV1(Number.NaN)).toThrow(
      'Semantic similarity must be a finite cosine similarity between -1 and 1.',
    );
  });

  it('returns identical decisions across repeated evaluation', () => {
    const first = decideStoryMatchV1(0.82);

    const second = decideStoryMatchV1(0.82);

    expect(first).toEqual(second);
  });
});
