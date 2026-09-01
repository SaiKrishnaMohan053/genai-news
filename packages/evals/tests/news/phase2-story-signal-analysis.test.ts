import { describe, expect, it } from 'vitest';

import {
  analyzeLexicalThresholds,
  analyzeStoryClusteringPairs,
  getLeastLexicallySimilarPositivePairs,
  getMostLexicallySimilarNegativePairs,
  phase2StoryClusteringBaseline,
} from '../../src/news/index.js';

describe('Phase 2 story similarity signal analysis', () => {
  it('derives pair labels from expected clusters', () => {
    const analysis = analyzeStoryClusteringPairs(phase2StoryClusteringBaseline);

    expect(analysis.pairs.length).toBeGreaterThan(0);

    expect(analysis.positivePairs.length).toBeGreaterThan(0);

    expect(analysis.negativePairs.length).toBeGreaterThan(0);

    expect(analysis.positivePairs.every((pair) => pair.expectedSameStory)).toBe(true);

    expect(analysis.negativePairs.every((pair) => !pair.expectedSameStory)).toBe(true);
  });

  it('derives exactly one pair for a two-article scenario', () => {
    const corpus = {
      ...phase2StoryClusteringBaseline,

      scenarios: phase2StoryClusteringBaseline.scenarios.filter(
        (scenario) => scenario.id === 'same-event-time-variation',
      ),
    };

    const analysis = analyzeStoryClusteringPairs(corpus);

    expect(analysis.pairs).toHaveLength(1);

    expect(analysis.positivePairs).toHaveLength(1);

    expect(analysis.negativePairs).toHaveLength(0);

    expect(analysis.pairs[0]?.expectedSameStory).toBe(true);

    expect(analysis.negativeSummary.titleTokenJaccard).toEqual({
      min: null,
      mean: null,
      max: null,
    });

    expect(analysis.negativeSummary.titleTokenOrderSimilarity).toEqual({
      min: null,
      mean: null,
      max: null,
    });
  });

  it('derives all unordered article pairs exactly once', () => {
    const scenario = phase2StoryClusteringBaseline.scenarios.find(
      (item) => item.id === 'ordering-stability',
    );

    expect(scenario).toBeDefined();

    const corpus = {
      ...phase2StoryClusteringBaseline,
      scenarios: [scenario!],
    };

    const analysis = analyzeStoryClusteringPairs(corpus);

    // n * (n - 1) / 2 for four articles.
    expect(analysis.pairs).toHaveLength(6);

    const identities = analysis.pairs.map((pair) => `${pair.leftArticleId}:${pair.rightArticleId}`);

    expect(new Set(identities).size).toBe(6);
  });

  it('summarizes same-story and different-story signals independently', () => {
    const analysis = analyzeStoryClusteringPairs(phase2StoryClusteringBaseline);

    expect(analysis.positiveSummary.count).toBe(analysis.positivePairs.length);

    expect(analysis.negativeSummary.count).toBe(analysis.negativePairs.length);

    expect(analysis.positiveSummary.titleTokenJaccard.min).not.toBeNull();

    expect(analysis.positiveSummary.titleTokenJaccard.max).not.toBeNull();

    expect(analysis.positiveSummary.titleTokenJaccard.min!).toBeGreaterThanOrEqual(0);

    expect(analysis.positiveSummary.titleTokenJaccard.max!).toBeLessThanOrEqual(1);
  });

  it('finds dangerous negative pairs from measured lexical strength', () => {
    const analysis = analyzeStoryClusteringPairs(phase2StoryClusteringBaseline);

    const pairs = getMostLexicallySimilarNegativePairs(analysis, 3);

    expect(pairs).toHaveLength(3);

    expect(pairs.every((pair) => !pair.expectedSameStory)).toBe(true);
  });

  it('finds weak positive pairs from measured lexical strength', () => {
    const analysis = analyzeStoryClusteringPairs(phase2StoryClusteringBaseline);

    const pairs = getLeastLexicallySimilarPositivePairs(analysis, 3);

    expect(pairs).toHaveLength(3);

    expect(pairs.every((pair) => pair.expectedSameStory)).toBe(true);
  });

  it('sweeps observed lexical thresholds deterministically', () => {
    const analysis = analyzeStoryClusteringPairs(phase2StoryClusteringBaseline);

    const first = analyzeLexicalThresholds(analysis.pairs);

    const second = analyzeLexicalThresholds(analysis.pairs);

    expect(first).toEqual(second);

    expect(first.results.length).toBeGreaterThan(0);

    expect(first.bestF1).not.toBeNull();
  });

  it('never reports invalid classification metrics', () => {
    const analysis = analyzeStoryClusteringPairs(phase2StoryClusteringBaseline);

    const thresholds = analyzeLexicalThresholds(analysis.pairs);

    for (const result of thresholds.results) {
      expect(result.metrics.precision).toBeGreaterThanOrEqual(0);

      expect(result.metrics.precision).toBeLessThanOrEqual(1);

      expect(result.metrics.recall).toBeGreaterThanOrEqual(0);

      expect(result.metrics.recall).toBeLessThanOrEqual(1);

      expect(result.metrics.falseMergeRate).toBeGreaterThanOrEqual(0);

      expect(result.metrics.falseMergeRate).toBeLessThanOrEqual(1);

      expect(result.metrics.falseSplitRate).toBeGreaterThanOrEqual(0);

      expect(result.metrics.falseSplitRate).toBeLessThanOrEqual(1);
    }
  });
});
