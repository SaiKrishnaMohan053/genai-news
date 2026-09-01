import { describe, expect, it } from 'vitest';

import {
  analyzeSemanticSimilarity,
  analyzeSemanticThresholds,
  analyzeStoryClusteringPairs,
  calculateCosineSimilarity,
  phase2StoryClusteringBaseline,
  evaluateSemanticThreshold,
  type SemanticEmbeddingClient,
} from '../../src/news/index.js';

describe('Phase 2 semantic similarity analysis', () => {
  it('returns cosine one for identical vectors', () => {
    expect(calculateCosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it('returns cosine zero for orthogonal vectors', () => {
    expect(calculateCosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('evaluates an explicit frozen semantic threshold independently of threshold search', () => {
    const metrics = evaluateSemanticThreshold(
      [
        {
          scenarioId: 'positive',
          leftArticleId: 'a',
          rightArticleId: 'b',
          expectedSameStory: true,
          semanticCosineSimilarity: 0.8,
        },

        {
          scenarioId: 'negative',
          leftArticleId: 'c',
          rightArticleId: 'd',
          expectedSameStory: false,
          semanticCosineSimilarity: 0.65,
        },
      ],
      0.7,
    );

    expect(metrics).toEqual({
      truePositive: 1,
      falsePositive: 0,
      trueNegative: 1,
      falseNegative: 0,

      precision: 1,
      recall: 1,
      f1: 1,

      falseMergeRate: 0,
      falseSplitRate: 0,
    });
  });

  it('is symmetric', () => {
    const left = [1, 2, 0];
    const right = [2, 1, 1];

    expect(calculateCosineSimilarity(left, right)).toBeCloseTo(
      calculateCosineSimilarity(right, left),
    );
  });

  it('rejects mismatched vector dimensions', () => {
    expect(() => calculateCosineSimilarity([1, 2], [1])).toThrow(
      'Cosine similarity requires vectors with equal dimensions.',
    );
  });

  it('rejects zero vectors', () => {
    expect(() => calculateCosineSimilarity([0, 0], [1, 1])).toThrow(
      'Cosine similarity cannot compare a zero vector.',
    );
  });

  it('uses title-only embedding requests and analyzes all labelled pairs', async () => {
    const pairwise = analyzeStoryClusteringPairs(phase2StoryClusteringBaseline);

    const receivedTexts: string[] = [];

    const fakeClient: SemanticEmbeddingClient = {
      async embed(inputs) {
        return inputs.map((input, index) => {
          receivedTexts.push(input.text);

          return {
            id: input.id,

            embedding: [index + 1, 1],
          };
        });
      },
    };

    const semantic = await analyzeSemanticSimilarity(
      phase2StoryClusteringBaseline,
      pairwise.pairs,
      fakeClient,
    );

    const articleCount = phase2StoryClusteringBaseline.scenarios.reduce(
      (total, scenario) => total + scenario.articles.length,
      0,
    );

    expect(receivedTexts).toHaveLength(articleCount);

    expect(semantic.pairs).toHaveLength(pairwise.pairs.length);

    expect(semantic.positivePairs).toHaveLength(pairwise.positivePairs.length);

    expect(semantic.negativePairs).toHaveLength(pairwise.negativePairs.length);
  });

  it('produces semantic similarity values within cosine bounds', async () => {
    const pairwise = analyzeStoryClusteringPairs(phase2StoryClusteringBaseline);

    const fakeClient: SemanticEmbeddingClient = {
      async embed(inputs) {
        return inputs.map((input, index) => ({
          id: input.id,

          embedding: [index + 1, 1, 0.5],
        }));
      },
    };

    const semantic = await analyzeSemanticSimilarity(
      phase2StoryClusteringBaseline,
      pairwise.pairs,
      fakeClient,
    );

    for (const pair of semantic.pairs) {
      expect(pair.semanticCosineSimilarity).toBeGreaterThanOrEqual(-1);

      expect(pair.semanticCosineSimilarity).toBeLessThanOrEqual(1);
    }
  });

  it('sweeps semantic thresholds deterministically', () => {
    const pairs = [
      {
        scenarioId: 'scenario',
        leftArticleId: 'a',
        rightArticleId: 'b',
        expectedSameStory: true,
        semanticCosineSimilarity: 0.9,
      },

      {
        scenarioId: 'scenario',
        leftArticleId: 'a',
        rightArticleId: 'c',
        expectedSameStory: false,
        semanticCosineSimilarity: 0.4,
      },
    ];

    const first = analyzeSemanticThresholds(pairs);

    const second = analyzeSemanticThresholds(pairs);

    expect(first).toEqual(second);

    expect(first.bestZeroFalseMerge?.metrics.falsePositive).toBe(0);
  });

  it('can recover a perfectly separated semantic example', () => {
    const result = analyzeSemanticThresholds([
      {
        scenarioId: 'one',
        leftArticleId: 'a',
        rightArticleId: 'b',
        expectedSameStory: true,
        semanticCosineSimilarity: 0.9,
      },
      {
        scenarioId: 'two',
        leftArticleId: 'c',
        rightArticleId: 'd',
        expectedSameStory: true,
        semanticCosineSimilarity: 0.8,
      },
      {
        scenarioId: 'three',
        leftArticleId: 'e',
        rightArticleId: 'f',
        expectedSameStory: false,
        semanticCosineSimilarity: 0.3,
      },
    ]);

    expect(result.bestZeroFalseMerge?.metrics).toMatchObject({
      truePositive: 2,
      falsePositive: 0,
      falseNegative: 0,
      recall: 1,
      precision: 1,
    });
  });
});
