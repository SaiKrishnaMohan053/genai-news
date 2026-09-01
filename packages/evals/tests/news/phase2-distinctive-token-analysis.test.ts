import { describe, expect, it } from 'vitest';

import {
  analyzeDistinctiveTokens,
  analyzeDistinctiveTokenThresholds,
  analyzeStoryClusteringPairs,
  calculateDistinctiveTokenJaccard,
  phase2StoryClusteringBaseline,
} from '../../src/news/index.js';

describe('Phase 2 distinctive-token analysis', () => {
  it('evaluates every observed document-frequency cutoff deterministically', () => {
    const pairwise = analyzeStoryClusteringPairs(phase2StoryClusteringBaseline);

    const first = analyzeDistinctiveTokens(phase2StoryClusteringBaseline, pairwise.pairs);

    const second = analyzeDistinctiveTokens(phase2StoryClusteringBaseline, pairwise.pairs);

    expect(first).toEqual(second);

    expect(first.cutoffs.length).toBeGreaterThan(0);

    const frequencies = [...first.tokenStatistics.documentFrequencyByToken.values()];

    const uniqueFrequencyCount = new Set(frequencies).size;

    expect(first.cutoffs).toHaveLength(uniqueFrequencyCount);
  });

  it('selects tokens at or below the configured document-frequency cutoff', () => {
    const documentFrequencies = new Map<string, number>([
      ['common', 5],
      ['rare', 1],
      ['other', 1],
    ]);

    const result = calculateDistinctiveTokenJaccard(
      ['common', 'rare'],
      ['common', 'rare', 'other'],
      documentFrequencies,
      1,
    );

    expect(result.leftDistinctiveTokenCount).toBe(1);

    expect(result.rightDistinctiveTokenCount).toBe(2);

    expect(result.sharedDistinctiveTokenCount).toBe(1);

    expect(result.distinctiveTokenJaccard).toBe(0.5);
  });

  it('returns zero when no distinctive tokens exist at a cutoff', () => {
    const documentFrequencies = new Map<string, number>([['common', 5]]);

    const result = calculateDistinctiveTokenJaccard(['common'], ['common'], documentFrequencies, 1);

    expect(result.leftDistinctiveTokenCount).toBe(0);

    expect(result.rightDistinctiveTokenCount).toBe(0);

    expect(result.sharedDistinctiveTokenCount).toBe(0);

    expect(result.distinctiveTokenJaccard).toBe(0);
  });

  it('uses unique distinctive token membership rather than duplicate counts', () => {
    const documentFrequencies = new Map<string, number>([['rare', 1]]);

    const result = calculateDistinctiveTokenJaccard(
      ['rare', 'rare', 'rare'],
      ['rare'],
      documentFrequencies,
      1,
    );

    expect(result.leftDistinctiveTokenCount).toBe(1);

    expect(result.rightDistinctiveTokenCount).toBe(1);

    expect(result.sharedDistinctiveTokenCount).toBe(1);

    expect(result.distinctiveTokenJaccard).toBe(1);
  });

  it('analyzes all labelled pairs at every cutoff', () => {
    const pairwise = analyzeStoryClusteringPairs(phase2StoryClusteringBaseline);

    const distinctive = analyzeDistinctiveTokens(phase2StoryClusteringBaseline, pairwise.pairs);

    for (const cutoff of distinctive.cutoffs) {
      expect(cutoff.pairs).toHaveLength(pairwise.pairs.length);

      expect(cutoff.positivePairs).toHaveLength(pairwise.positivePairs.length);

      expect(cutoff.negativePairs).toHaveLength(pairwise.negativePairs.length);
    }
  });

  it('keeps distinctive-token Jaccard within zero and one', () => {
    const pairwise = analyzeStoryClusteringPairs(phase2StoryClusteringBaseline);

    const distinctive = analyzeDistinctiveTokens(phase2StoryClusteringBaseline, pairwise.pairs);

    for (const cutoff of distinctive.cutoffs) {
      for (const pair of cutoff.pairs) {
        expect(pair.distinctiveTokenJaccard).toBeGreaterThanOrEqual(0);

        expect(pair.distinctiveTokenJaccard).toBeLessThanOrEqual(1);
      }
    }
  });

  it('sweeps distinctive-token decision thresholds deterministically', () => {
    const pairwise = analyzeStoryClusteringPairs(phase2StoryClusteringBaseline);

    const distinctive = analyzeDistinctiveTokens(phase2StoryClusteringBaseline, pairwise.pairs);

    const first = analyzeDistinctiveTokenThresholds(distinctive);

    const second = analyzeDistinctiveTokenThresholds(distinctive);

    expect(first).toEqual(second);

    expect(first.results.length).toBeGreaterThan(0);

    expect(first.bestF1).not.toBeNull();
  });

  it('returns classification metrics within valid bounds', () => {
    const pairwise = analyzeStoryClusteringPairs(phase2StoryClusteringBaseline);

    const distinctive = analyzeDistinctiveTokens(phase2StoryClusteringBaseline, pairwise.pairs);

    const thresholds = analyzeDistinctiveTokenThresholds(distinctive);

    for (const result of thresholds.results) {
      expect(result.metrics.precision).toBeGreaterThanOrEqual(0);

      expect(result.metrics.precision).toBeLessThanOrEqual(1);

      expect(result.metrics.recall).toBeGreaterThanOrEqual(0);

      expect(result.metrics.recall).toBeLessThanOrEqual(1);

      expect(result.metrics.falseMergeRate).toBeGreaterThanOrEqual(0);

      expect(result.metrics.falseMergeRate).toBeLessThanOrEqual(1);
    }
  });

  it('rejects a non-positive document-frequency cutoff', () => {
    const frequencies = new Map<string, number>([['token', 1]]);

    expect(() => calculateDistinctiveTokenJaccard(['token'], ['token'], frequencies, 0)).toThrow(
      'Distinctive-token maximumDocumentFrequency must be a positive integer.',
    );
  });
});
