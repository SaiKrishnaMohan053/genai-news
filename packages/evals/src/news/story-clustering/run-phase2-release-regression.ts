import { evaluatePhase2ReleaseRegression } from './phase2-release-regression.js';

const result = evaluatePhase2ReleaseRegression();

console.log('');
console.log('Phase 2 Release Regression');
console.log('');

console.log(`Baseline: ${result.baselineId}`);
console.log(`Corpus: ${result.corpusId}`);
console.log(`Model: ${result.model}`);
console.log(`Threshold: ${result.threshold}`);

console.log('');
console.log(`TP: ${result.metrics.truePositive}`);
console.log(`FP: ${result.metrics.falsePositive}`);
console.log(`TN: ${result.metrics.trueNegative}`);
console.log(`FN: ${result.metrics.falseNegative}`);

console.log('');
console.log(`Precision: ${result.metrics.precision}`);
console.log(`Recall: ${result.metrics.recall}`);
console.log(`False merge rate: ${result.metrics.falseMergeRate}`);
console.log(`False split rate: ${result.metrics.falseSplitRate}`);

console.log('');
console.log(result.passed ? 'PHASE 2 REGRESSION: PASS' : 'PHASE 2 REGRESSION: FAIL');

if (!result.passed) {
  console.log('');

  for (const failure of result.failures) {
    console.log(`- ${failure}`);
  }

  process.exitCode = 1;
}
