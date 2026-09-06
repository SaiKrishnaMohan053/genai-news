import { evaluateNewsCorpus } from './evaluate-news-corpus.js';

import { evaluateNewsRegression } from './regression.js';

import { phase1NewsBaseline } from './baselines/phase1-baseline.js';

import {
  evaluatePhase2ReleaseRegression,
  type Phase2ReleaseRegressionResult,
} from './story-clustering/phase2-release-regression.js';

export type Phase2ReleaseGateResult = {
  passed: boolean;

  phase1: {
    passed: boolean;

    corpusId: string;

    casesPassed: number;

    casesTotal: number;

    failures: readonly string[];
  };

  phase2: Phase2ReleaseRegressionResult;

  failures: readonly string[];
};

export function evaluatePhase2ReleaseGate(): Phase2ReleaseGateResult {
  const phase1Run = evaluateNewsCorpus(phase1NewsBaseline);

  const phase1Regression = evaluateNewsRegression(phase1Run);

  const phase2 = evaluatePhase2ReleaseRegression();

  const failures: string[] = [];

  if (!phase1Regression.passed) {
    failures.push(
      ...phase1Regression.failures.map((failure) => `Phase 1 regression failed: ${failure}`),
    );
  }

  if (!phase2.passed) {
    failures.push(...phase2.failures.map((failure) => `Phase 2 regression failed: ${failure}`));
  }

  return {
    passed: phase1Regression.passed && phase2.passed,

    phase1: {
      passed: phase1Regression.passed,

      corpusId: phase1Run.corpusId,

      casesPassed: phase1Regression.aggregate.casesPassed,

      casesTotal: phase1Regression.aggregate.casesTotal,

      failures: phase1Regression.failures,
    },

    phase2,

    failures,
  };
}
