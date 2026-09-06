import { describe, expect, it } from 'vitest';

import { evaluatePhase2ReleaseGate } from '../../src/news/phase2-release-gate.js';

describe('Phase 2 release gate', () => {
  it('passes only when both Phase 1 and Phase 2 regressions pass', () => {
    const result = evaluatePhase2ReleaseGate();

    expect(result.passed).toBe(true);

    expect(result.phase1.passed).toBe(true);

    expect(result.phase2.passed).toBe(true);

    expect(result.failures).toEqual([]);
  });

  it('preserves the frozen Phase 1 and Phase 2 baselines', () => {
    const result = evaluatePhase2ReleaseGate();

    expect(result.phase1).toMatchObject({
      corpusId: 'phase1-baseline-v1',

      casesPassed: 17,

      casesTotal: 17,

      passed: true,
    });

    expect(result.phase2).toMatchObject({
      baselineId: 'phase2-release-v1',

      corpusId: 'phase2-story-clustering-v1',

      threshold: 0.7,

      passed: true,
    });
  });
});
