import { PHASE1_VALIDATION_SCENARIOS, type Phase1ValidationExpectation } from './contracts.js';

export function validatePhase1ValidationMatrix(
  matrix: readonly Phase1ValidationExpectation[],
): void {
  const scenarioIds = new Set<string>();

  for (const item of matrix) {
    if (scenarioIds.has(item.scenario)) {
      throw new Error(`Duplicate Phase 1 validation scenario: ${item.scenario}`);
    }

    scenarioIds.add(item.scenario);
  }

  for (const scenario of PHASE1_VALIDATION_SCENARIOS) {
    if (!scenarioIds.has(scenario)) {
      throw new Error(`Missing Phase 1 validation scenario: ${scenario}`);
    }
  }
}
