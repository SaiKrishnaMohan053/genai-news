import { evaluateNewsCorpus } from './evaluate-news-corpus.js';
import { evaluateNewsRegression } from './regression.js';
import { formatNewsEvaluationReport } from './report.js';

import { phase1NewsBaseline } from './baselines/phase1-baseline.js';

const run = evaluateNewsCorpus(phase1NewsBaseline);

const regression = evaluateNewsRegression(run);

console.log(formatNewsEvaluationReport(run, regression));

if (!regression.passed) {
  process.exitCode = 1;
}
