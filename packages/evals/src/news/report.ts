import type { NewsEvaluationRegressionResult, NewsEvaluationRunResult } from './contracts.js';

export function formatNewsEvaluationReport(
  run: NewsEvaluationRunResult,
  regression: NewsEvaluationRegressionResult,
): string {
  const aggregate = regression.aggregate;

  const lines = [
    'Phase 1 News Evaluation',
    `Corpus: ${run.corpusId}`,
    '',
    `Cases:            ${aggregate.casesPassed}/${aggregate.casesTotal} passed`,
    `Pass rate:        ${formatPercent(aggregate.passRate)}`,
    `Normalization:    ${formatPercent(aggregate.normalization.accuracy)}`,
    `Canonical URL:    ${formatPercent(aggregate.canonicalUrl.accuracy)}`,
    `Freshness:        ${formatPercent(aggregate.freshness.accuracy)}`,
    `Deduplication:    ${formatPercent(aggregate.deduplication.accuracy)}`,
    `Final outcome:    ${formatPercent(aggregate.finalOutcome.accuracy)}`,
    '',
    `REGRESSION: ${regression.passed ? 'PASS' : 'FAIL'}`,
  ];

  if (!regression.passed) {
    lines.push('');

    for (const failure of regression.failures) {
      lines.push(`- ${failure}`);
    }

    const failedCases = run.cases.filter((item) => !item.passed);

    for (const evaluationCase of failedCases) {
      lines.push('');
      lines.push(`Case: ${evaluationCase.caseId}`);

      for (const failure of evaluationCase.failures) {
        lines.push(`  - ${failure}`);
      }
    }
  }

  return lines.join('\n');
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}
