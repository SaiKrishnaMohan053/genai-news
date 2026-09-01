import type { StoryThresholdMetrics } from './threshold-analysis.js';

import type { StorySemanticPair } from './semantic-similarity-analysis.js';

export type StorySemanticThresholdResult = {
  minimumSemanticSimilarity: number;

  metrics: StoryThresholdMetrics;
};

export type StorySemanticThresholdAnalysis = {
  results: readonly StorySemanticThresholdResult[];

  bestF1: StorySemanticThresholdResult | null;

  bestZeroFalseMerge: StorySemanticThresholdResult | null;
};

export function analyzeSemanticThresholds(
  pairs: readonly StorySemanticPair[],
): StorySemanticThresholdAnalysis {
  const thresholds = uniqueSorted([...pairs.map((pair) => pair.semanticCosineSimilarity)]);

  const results = thresholds.map((minimumSemanticSimilarity) => ({
    minimumSemanticSimilarity,

    metrics: evaluateSemanticThreshold(pairs, minimumSemanticSimilarity),
  }));

  return {
    results,

    bestF1: selectBestF1(results),

    bestZeroFalseMerge: selectBestZeroFalseMerge(results),
  };
}

export function evaluateSemanticThreshold(
  pairs: readonly StorySemanticPair[],
  minimumSemanticSimilarity: number,
): StoryThresholdMetrics {
  let truePositive = 0;
  let falsePositive = 0;
  let trueNegative = 0;
  let falseNegative = 0;

  for (const pair of pairs) {
    const predictedMatch = pair.semanticCosineSimilarity >= minimumSemanticSimilarity;

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
  results: readonly StorySemanticThresholdResult[],
): StorySemanticThresholdResult | null {
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
  results: readonly StorySemanticThresholdResult[],
): StorySemanticThresholdResult | null {
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

    return right.minimumSemanticSimilarity - left.minimumSemanticSimilarity;
  })[0]!;
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function safeDivide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}
