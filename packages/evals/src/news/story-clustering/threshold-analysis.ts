import type { StoryClusteringLabelledPair } from './pairwise-analysis.js';

export type StoryThresholdMetrics = {
  truePositive: number;
  falsePositive: number;
  trueNegative: number;
  falseNegative: number;

  precision: number;
  recall: number;
  f1: number;

  falseMergeRate: number;
  falseSplitRate: number;
};

export type StoryLexicalThresholdResult = {
  minimumJaccard: number;
  minimumOrderSimilarity: number;

  metrics: StoryThresholdMetrics;
};

export type StoryThresholdAnalysisResult = {
  results: readonly StoryLexicalThresholdResult[];

  bestF1: StoryLexicalThresholdResult | null;

  bestZeroFalseMerge: StoryLexicalThresholdResult | null;
};

/**
 * Explores all behavior-changing lexical threshold combinations derived from
 * the actual observed corpus signal values.
 *
 * We intentionally do not use arbitrary 0.05 / 0.10 threshold increments.
 */
export function analyzeLexicalThresholds(
  pairs: readonly StoryClusteringLabelledPair[],
): StoryThresholdAnalysisResult {
  const jaccardThresholds = uniqueSorted([
    0,
    ...pairs.map((pair) => pair.signals.titleTokenJaccard),
  ]);

  const orderThresholds = uniqueSorted([
    0,
    ...pairs.map((pair) => pair.signals.titleTokenOrderSimilarity),
  ]);

  const results: StoryLexicalThresholdResult[] = [];

  for (const minimumJaccard of jaccardThresholds) {
    for (const minimumOrderSimilarity of orderThresholds) {
      results.push({
        minimumJaccard,
        minimumOrderSimilarity,

        metrics: evaluateThreshold(pairs, minimumJaccard, minimumOrderSimilarity),
      });
    }
  }

  const bestF1 = selectBestF1(results);

  const bestZeroFalseMerge = selectBestZeroFalseMerge(results);

  return {
    results,
    bestF1,
    bestZeroFalseMerge,
  };
}

function evaluateThreshold(
  pairs: readonly StoryClusteringLabelledPair[],
  minimumJaccard: number,
  minimumOrderSimilarity: number,
): StoryThresholdMetrics {
  let truePositive = 0;
  let falsePositive = 0;
  let trueNegative = 0;
  let falseNegative = 0;

  for (const pair of pairs) {
    const predictedMatch =
      pair.signals.titleTokenJaccard >= minimumJaccard &&
      pair.signals.titleTokenOrderSimilarity >= minimumOrderSimilarity;

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
  results: readonly StoryLexicalThresholdResult[],
): StoryLexicalThresholdResult | null {
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
  results: readonly StoryLexicalThresholdResult[],
): StoryLexicalThresholdResult | null {
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

    return right.minimumJaccard - left.minimumJaccard;
  })[0]!;
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function safeDivide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}
