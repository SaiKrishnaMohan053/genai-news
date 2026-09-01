import type { StoryInformativeTokenPair } from './informative-token-analysis.js';

import type { StoryThresholdMetrics } from './threshold-analysis.js';

export type StoryInformativeThresholdResult = {
  minimumWeightedJaccard: number;

  metrics: StoryThresholdMetrics;
};

export type StoryInformativeThresholdAnalysis = {
  results: readonly StoryInformativeThresholdResult[];

  bestF1: StoryInformativeThresholdResult | null;

  bestZeroFalseMerge: StoryInformativeThresholdResult | null;
};

export function analyzeInformativeTokenThresholds(
  pairs: readonly StoryInformativeTokenPair[],
): StoryInformativeThresholdAnalysis {
  const thresholds = uniqueSorted([0, ...pairs.map((pair) => pair.weightedTokenJaccard)]);

  const results = thresholds.map((minimumWeightedJaccard) => ({
    minimumWeightedJaccard,

    metrics: evaluate(pairs, minimumWeightedJaccard),
  }));

  return {
    results,

    bestF1: selectBestF1(results),

    bestZeroFalseMerge: selectBestZeroFalseMerge(results),
  };
}

function evaluate(
  pairs: readonly StoryInformativeTokenPair[],
  minimumWeightedJaccard: number,
): StoryThresholdMetrics {
  let truePositive = 0;
  let falsePositive = 0;
  let trueNegative = 0;
  let falseNegative = 0;

  for (const pair of pairs) {
    const predictedMatch = pair.weightedTokenJaccard >= minimumWeightedJaccard;

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
  results: readonly StoryInformativeThresholdResult[],
): StoryInformativeThresholdResult | null {
  if (results.length === 0) {
    return null;
  }

  return [...results].sort((left, right) => {
    if (right.metrics.f1 !== left.metrics.f1) {
      return right.metrics.f1 - left.metrics.f1;
    }

    if (left.metrics.falseMergeRate !== right.metrics.falseMergeRate) {
      return left.metrics.falseMergeRate - right.metrics.falseMergeRate;
    }

    return right.metrics.recall - left.metrics.recall;
  })[0]!;
}

function selectBestZeroFalseMerge(
  results: readonly StoryInformativeThresholdResult[],
): StoryInformativeThresholdResult | null {
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

    return right.minimumWeightedJaccard - left.minimumWeightedJaccard;
  })[0]!;
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function safeDivide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}
