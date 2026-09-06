import { describe, expect, it } from 'vitest';

import { evaluatePhase2ReleaseRegression } from '../../src/news/story-clustering/phase2-release-regression.js';
describe('Phase 2 release regression', () => {
  it('passes the frozen Phase 2 v1 semantic release baseline', () => {
    const result = evaluatePhase2ReleaseRegression();

    expect(result.passed).toBe(true);

    expect(result.failures).toEqual([]);

    expect(result.metrics).toMatchObject({
      truePositive: 9,

      falsePositive: 0,

      trueNegative: 12,

      falseNegative: 0,

      precision: 1,

      recall: 1,

      falseMergeRate: 0,

      falseSplitRate: 0,
    });
  });

  it('evaluates all frozen semantic pairs', () => {
    const result = evaluatePhase2ReleaseRegression();

    const evaluatedPairCount =
      result.metrics.truePositive +
      result.metrics.falsePositive +
      result.metrics.trueNegative +
      result.metrics.falseNegative;

    expect(evaluatedPairCount).toBe(21);
  });
});
