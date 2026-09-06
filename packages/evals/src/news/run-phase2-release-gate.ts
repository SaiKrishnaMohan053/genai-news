import { evaluatePhase2ReleaseGate } from './phase2-release-gate.js';

const result = evaluatePhase2ReleaseGate();

console.log('');
console.log('Phase 2 Release Gate');
console.log('');

console.log('Phase 1');
console.log(`  Corpus: ${result.phase1.corpusId}`);
console.log(`  Cases: ${result.phase1.casesPassed}/${result.phase1.casesTotal}`);
console.log(`  Regression: ${result.phase1.passed ? 'PASS' : 'FAIL'}`);

console.log('');
console.log('Phase 2');
console.log(`  Baseline: ${result.phase2.baselineId}`);
console.log(`  Corpus: ${result.phase2.corpusId}`);
console.log(`  Model: ${result.phase2.model}`);
console.log(`  Threshold: ${result.phase2.threshold}`);
console.log(
  [
    '  Metrics:',
    `TP=${result.phase2.metrics.truePositive}`,
    `FP=${result.phase2.metrics.falsePositive}`,
    `TN=${result.phase2.metrics.trueNegative}`,
    `FN=${result.phase2.metrics.falseNegative}`,
  ].join(' '),
);
console.log(`  Regression: ${result.phase2.passed ? 'PASS' : 'FAIL'}`);

console.log('');

console.log(result.passed ? 'PHASE 2 RELEASE GATE: PASS' : 'PHASE 2 RELEASE GATE: FAIL');

if (!result.passed) {
  console.log('');

  for (const failure of result.failures) {
    console.log(`- ${failure}`);
  }

  process.exitCode = 1;
}
