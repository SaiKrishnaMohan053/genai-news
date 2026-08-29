import type {
  NewsEvaluationRegressionPolicy,
  NewsEvaluationRegressionResult,
  NewsEvaluationRunResult,
} from './contracts.js';

import { aggregateNewsEvaluation } from './aggregate.js';

export const STRICT_NEWS_EVALUATION_POLICY: NewsEvaluationRegressionPolicy = {
  minimumPassRate: 1,
  requireZeroFailures: true,
};

export function evaluateNewsRegression(
  run: NewsEvaluationRunResult,
  policy: NewsEvaluationRegressionPolicy = STRICT_NEWS_EVALUATION_POLICY,
): NewsEvaluationRegressionResult {
  validateRegressionPolicy(policy);

  const aggregate = aggregateNewsEvaluation(run);
  const failures: string[] = [];

  if (aggregate.passRate < policy.minimumPassRate) {
    failures.push(`pass rate ${aggregate.passRate} is below minimum ${policy.minimumPassRate}`);
  }

  if (policy.requireZeroFailures && aggregate.casesFailed > 0) {
    failures.push(`${aggregate.casesFailed} evaluation case(s) failed`);
  }

  return {
    passed: failures.length === 0,
    aggregate,
    policy,
    failures,
  };
}

function validateRegressionPolicy(policy: NewsEvaluationRegressionPolicy): void {
  if (
    !Number.isFinite(policy.minimumPassRate) ||
    policy.minimumPassRate < 0 ||
    policy.minimumPassRate > 1
  ) {
    throw new Error('minimumPassRate must be a finite number between 0 and 1.');
  }
}
