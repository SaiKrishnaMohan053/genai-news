import type { StoryThresholdMetrics } from './threshold-analysis.js';

import type {
  StoryDistinctiveTokenAnalysis,
  StoryDistinctiveTokenPair,
} from './distinctive-token-analysis.js';

export type StoryDistinctiveThresholdResult = {
  maximumDocumentFrequency: number;

  minimumSharedDistinctiveTokens: number;

  minimumDistinctiveTokenJaccard: number;

  metrics: StoryThresholdMetrics;
};

export type StoryDistinctiveThresholdAnalysis = {
  results: readonly StoryDistinctiveThresholdResult[];

  bestF1: StoryDistinctiveThresholdResult | null;

  bestZeroFalseMerge: StoryDistinctiveThresholdResult | null;
};

export function analyzeDistinctiveTokenThresholds(
  analysis: StoryDistinctiveTokenAnalysis,
): StoryDistinctiveThresholdAnalysis {
  const results: StoryDistinctiveThresholdResult[] = [];

  for (const cutoff of analysis.cutoffs) {
    const sharedTokenThresholds = uniqueSorted([
      0,
      ...cutoff.pairs.map((pair) => pair.sharedDistinctiveTokenCount),
    ]);

    const jaccardThresholds = uniqueSorted([
      0,
      ...cutoff.pairs.map((pair) => pair.distinctiveTokenJaccard),
    ]);

    for (const minimumSharedDistinctiveTokens of sharedTokenThresholds) {
      for (const minimumDistinctiveTokenJaccard of jaccardThresholds) {
        results.push({
          maximumDocumentFrequency: cutoff.maximumDocumentFrequency,

          minimumSharedDistinctiveTokens,

          minimumDistinctiveTokenJaccard,

          metrics: evaluate(
            cutoff.pairs,
            minimumSharedDistinctiveTokens,
            minimumDistinctiveTokenJaccard,
          ),
        });
      }
    }
  }

  return {
    results,

    bestF1: selectBestF1(results),

    bestZeroFalseMerge: selectBestZeroFalseMerge(results),
  };
}

function evaluate(
  pairs: readonly StoryDistinctiveTokenPair[],
  minimumSharedDistinctiveTokens: number,
  minimumDistinctiveTokenJaccard: number,
): StoryThresholdMetrics {
  let truePositive = 0;
  let falsePositive = 0;
  let trueNegative = 0;
  let falseNegative = 0;

  for (const pair of pairs) {
    const predictedMatch =
      pair.sharedDistinctiveTokenCount >= minimumSharedDistinctiveTokens &&
      pair.distinctiveTokenJaccard >= minimumDistinctiveTokenJaccard;

    if (predictedMatch && pair.expectedSameStory) {
      truePositive += 1;
      continue;
    }

    if (predictedMatch && !pair.expectedSameStory) {
      falsePositive += 1;
      continue;
    }

    if (!predictedMatch && pair.expectedSameStory) {
      falseNegative += 1;
      continue;
    }

    trueNegative += 1;
  }

  const precision = safeDivide(truePositive, truePositive + falsePositive);

  const recall = safeDivide(truePositive, truePositive + falseNegative);

  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  return {
    truePositive,
    falsePositive,
    trueNegative,
    falseNegative,

    precision,
    recall,
    f1,

    falseMergeRate: safeDivide(falsePositive, falsePositive + trueNegative),

    falseSplitRate: safeDivide(falseNegative, truePositive + falseNegative),
  };
}

function selectBestF1(
  results: readonly StoryDistinctiveThresholdResult[],
): StoryDistinctiveThresholdResult | null {
  if (results.length === 0) {
    return null;
  }

  return [...results].sort(compareBestF1)[0]!;
}

function selectBestZeroFalseMerge(
  results: readonly StoryDistinctiveThresholdResult[],
): StoryDistinctiveThresholdResult | null {
  const safe = results.filter(
    (result) => result.metrics.falsePositive === 0 && result.metrics.truePositive > 0,
  );

  if (safe.length === 0) {
    return null;
  }

  return [...safe].sort((left, right) => {
    if (right.metrics.recall !== left.metrics.recall) {
      return right.metrics.recall - left.metrics.recall;
    }

    if (right.metrics.f1 !== left.metrics.f1) {
      return right.metrics.f1 - left.metrics.f1;
    }

    /**
     * If classification performance is equal,
     * prefer the less restrictive / simpler
     * distinctive-token policy.
     */
    if (left.maximumDocumentFrequency !== right.maximumDocumentFrequency) {
      return right.maximumDocumentFrequency - left.maximumDocumentFrequency;
    }

    if (left.minimumSharedDistinctiveTokens !== right.minimumSharedDistinctiveTokens) {
      return left.minimumSharedDistinctiveTokens - right.minimumSharedDistinctiveTokens;
    }

    return left.minimumDistinctiveTokenJaccard - right.minimumDistinctiveTokenJaccard;
  })[0]!;
}

function compareBestF1(
  left: StoryDistinctiveThresholdResult,
  right: StoryDistinctiveThresholdResult,
): number {
  if (right.metrics.f1 !== left.metrics.f1) {
    return right.metrics.f1 - left.metrics.f1;
  }

  if (left.metrics.falseMergeRate !== right.metrics.falseMergeRate) {
    return left.metrics.falseMergeRate - right.metrics.falseMergeRate;
  }

  return right.metrics.recall - left.metrics.recall;
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function safeDivide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}
