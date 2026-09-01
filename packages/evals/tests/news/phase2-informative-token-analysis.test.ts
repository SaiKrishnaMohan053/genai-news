import { describe, expect, it } from 'vitest';

import {
  analyzeInformativeTokenSimilarity,
  analyzeInformativeTokenThresholds,
  analyzeStoryClusteringPairs,
  buildStoryTokenStatistics,
  calculateWeightedTokenJaccard,
  phase2StoryClusteringBaseline,
} from '../../src/news/index.js';

describe('Phase 2 informative-token analysis', () => {
  it('builds deterministic corpus token statistics', () => {
    const first = buildStoryTokenStatistics(phase2StoryClusteringBaseline);

    const second = buildStoryTokenStatistics(phase2StoryClusteringBaseline);

    expect(first.documentCount).toBeGreaterThan(0);

    expect([...first.documentFrequencyByToken]).toEqual([...second.documentFrequencyByToken]);

    expect([...first.inverseDocumentFrequencyByToken]).toEqual([
      ...second.inverseDocumentFrequencyByToken,
    ]);
  });

  it('assigns lower IDF to more common tokens', () => {
    const corpus = {
      id: 'idf-test',
      description: 'IDF test corpus',

      scenarios: [
        {
          id: 'scenario',
          description: 'Token frequency test',
          tags: ['clear-different-story'] as const,

          articles: [
            {
              id: 'a',
              title: 'common alpha',
              canonicalUrl: 'https://example.com/a',
              publisherName: null,
              publishedAt: null,
            },
            {
              id: 'b',
              title: 'common beta',
              canonicalUrl: 'https://example.com/b',
              publisherName: null,
              publishedAt: null,
            },
          ],

          expectedClusters: [
            {
              clusterId: 'cluster-a',
              articleIds: ['a'],
            },
            {
              clusterId: 'cluster-b',
              articleIds: ['b'],
            },
          ],
        },
      ],
    };

    const stats = buildStoryTokenStatistics(corpus);

    const common = stats.inverseDocumentFrequencyByToken.get('common');

    const alpha = stats.inverseDocumentFrequencyByToken.get('alpha');

    expect(common).toBeDefined();
    expect(alpha).toBeDefined();

    expect(common!).toBeLessThan(alpha!);
  });

  it('returns perfect weighted Jaccard for identical token sets', () => {
    const weights = new Map<string, number>([
      ['alpha', 1],
      ['beta', 2],
    ]);

    expect(calculateWeightedTokenJaccard(['alpha', 'beta'], ['beta', 'alpha'], weights)).toBe(1);
  });

  it('gives informative shared tokens more influence', () => {
    const weights = new Map<string, number>([
      ['common', 1],
      ['rare', 5],
      ['other', 5],
    ]);

    const shareRare = calculateWeightedTokenJaccard(['common', 'rare'], ['rare'], weights);

    const shareCommon = calculateWeightedTokenJaccard(
      ['common', 'rare'],
      ['common', 'other'],
      weights,
    );

    expect(shareRare).toBeGreaterThan(shareCommon);
  });

  it('analyzes all previously labelled pairs', () => {
    const pairwise = analyzeStoryClusteringPairs(phase2StoryClusteringBaseline);

    const informative = analyzeInformativeTokenSimilarity(
      phase2StoryClusteringBaseline,
      pairwise.pairs,
    );

    expect(informative.pairs).toHaveLength(pairwise.pairs.length);

    expect(informative.positivePairs).toHaveLength(pairwise.positivePairs.length);

    expect(informative.negativePairs).toHaveLength(pairwise.negativePairs.length);
  });

  it('keeps weighted similarity within zero and one', () => {
    const pairwise = analyzeStoryClusteringPairs(phase2StoryClusteringBaseline);

    const informative = analyzeInformativeTokenSimilarity(
      phase2StoryClusteringBaseline,
      pairwise.pairs,
    );

    for (const pair of informative.pairs) {
      expect(pair.weightedTokenJaccard).toBeGreaterThanOrEqual(0);

      expect(pair.weightedTokenJaccard).toBeLessThanOrEqual(1);
    }
  });

  it('sweeps informative-token thresholds deterministically', () => {
    const pairwise = analyzeStoryClusteringPairs(phase2StoryClusteringBaseline);

    const informative = analyzeInformativeTokenSimilarity(
      phase2StoryClusteringBaseline,
      pairwise.pairs,
    );

    const first = analyzeInformativeTokenThresholds(informative.pairs);

    const second = analyzeInformativeTokenThresholds(informative.pairs);

    expect(first).toEqual(second);

    expect(first.results.length).toBeGreaterThan(0);

    expect(first.bestF1).not.toBeNull();
  });

  it('does not mutate the frozen evaluation corpus', () => {
    const before = JSON.stringify(phase2StoryClusteringBaseline);

    buildStoryTokenStatistics(phase2StoryClusteringBaseline);

    const after = JSON.stringify(phase2StoryClusteringBaseline);

    expect(after).toBe(before);
  });
});
