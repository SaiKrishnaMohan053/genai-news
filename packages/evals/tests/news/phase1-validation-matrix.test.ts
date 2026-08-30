import { describe, expect, it } from 'vitest';

import {
  PHASE1_VALIDATION_SCENARIOS,
  phase1ValidationMatrix,
  validatePhase1ValidationMatrix,
} from '../../src/index.js';

describe('phase1ValidationMatrix', () => {
  it('defines every required Phase 1 validation scenario', () => {
    expect(() => validatePhase1ValidationMatrix(phase1ValidationMatrix)).not.toThrow();

    expect(phase1ValidationMatrix).toHaveLength(PHASE1_VALIDATION_SCENARIOS.length);
  });

  it('requires duplicate-safe recovery scenarios', () => {
    const recoveryScenarios = phase1ValidationMatrix.filter(
      (item) =>
        item.scenario === 'worker-retry' ||
        item.scenario === 'replayed-job' ||
        item.scenario === 'repeated-discovery',
    );

    expect(recoveryScenarios).toHaveLength(3);

    for (const scenario of recoveryScenarios) {
      expect(scenario.expectsDuplicatePersistence).toBe(false);
    }
  });

  it('requires persistence for successful recovery', () => {
    const workerRetry = phase1ValidationMatrix.find((item) => item.scenario === 'worker-retry');

    expect(workerRetry).toMatchObject({
      expectedOutcome: 'success',
      expectsRetry: true,
      expectsPersistence: true,
      expectsDuplicatePersistence: false,
    });
  });

  it('requires enqueue failure to stop before persistence', () => {
    const queueUnavailable = phase1ValidationMatrix.find(
      (item) => item.scenario === 'queue-unavailable',
    );

    expect(queueUnavailable).toMatchObject({
      expectsRetry: false,
      expectsPersistence: false,
      expectsDuplicatePersistence: false,
    });
  });
});
