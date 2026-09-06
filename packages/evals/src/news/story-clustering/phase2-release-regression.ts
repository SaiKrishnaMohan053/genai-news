import type { StoryThresholdMetrics } from './threshold-analysis.js';

import { evaluateSemanticThreshold } from './semantic-threshold-analysis.js';

import type { StorySemanticPair } from './semantic-similarity-analysis.js';

import semanticSnapshot from './baselines/phase2-semantic-snapshot.json' with { type: 'json' };
import { phase2ReleaseBaseline } from './baselines/phase2-release-baseline.js';

export type Phase2ReleaseRegressionResult = {
  passed: boolean;

  baselineId: string;

  corpusId: string;

  model: string;

  threshold: number;

  metrics: StoryThresholdMetrics;

  failures: readonly string[];
};

export function evaluatePhase2ReleaseRegression(): Phase2ReleaseRegressionResult {
  const failures: string[] = [];

  if (semanticSnapshot.corpusId !== phase2ReleaseBaseline.corpusId) {
    failures.push(
      [
        'Semantic snapshot corpus mismatch.',
        `expected=${phase2ReleaseBaseline.corpusId}`,
        `actual=${semanticSnapshot.corpusId}`,
      ].join(' '),
    );
  }

  if (semanticSnapshot.model !== phase2ReleaseBaseline.semanticPolicy.model) {
    failures.push(
      [
        'Semantic snapshot model mismatch.',
        `expected=${phase2ReleaseBaseline.semanticPolicy.model}`,
        `actual=${semanticSnapshot.model}`,
      ].join(' '),
    );
  }

  const metrics = evaluateSemanticThreshold(
    semanticSnapshot.pairs as readonly StorySemanticPair[],
    phase2ReleaseBaseline.semanticPolicy.minimumSimilarity,
  );

  const expected = phase2ReleaseBaseline.semanticPolicy.expectedMetrics;

  compareMetric(failures, 'truePositive', metrics.truePositive, expected.truePositive);

  compareMetric(failures, 'falsePositive', metrics.falsePositive, expected.falsePositive);

  compareMetric(failures, 'trueNegative', metrics.trueNegative, expected.trueNegative);

  compareMetric(failures, 'falseNegative', metrics.falseNegative, expected.falseNegative);

  compareMetric(failures, 'precision', metrics.precision, expected.precision);

  compareMetric(failures, 'recall', metrics.recall, expected.recall);

  compareMetric(failures, 'falseMergeRate', metrics.falseMergeRate, expected.falseMergeRate);

  compareMetric(failures, 'falseSplitRate', metrics.falseSplitRate, expected.falseSplitRate);

  return {
    passed: failures.length === 0,

    baselineId: phase2ReleaseBaseline.id,

    corpusId: semanticSnapshot.corpusId,

    model: semanticSnapshot.model,

    threshold: phase2ReleaseBaseline.semanticPolicy.minimumSimilarity,

    metrics,

    failures,
  };
}

function compareMetric(failures: string[], name: string, actual: number, expected: number): void {
  if (actual !== expected) {
    failures.push(
      [
        `Phase 2 release metric mismatch: ${name}.`,
        `expected=${expected}`,
        `actual=${actual}`,
      ].join(' '),
    );
  }
}
