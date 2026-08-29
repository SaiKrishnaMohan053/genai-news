import type {
  NewsEvaluationAggregate,
  NewsEvaluationCaseResult,
  NewsEvaluationRunResult,
} from './contracts.js';

type MetricCounter = {
  evaluated: number;
  correct: number;
};

export function aggregateNewsEvaluation(run: NewsEvaluationRunResult): NewsEvaluationAggregate {
  const normalization = createCounter();
  const canonicalUrl = createCounter();
  const freshness = createCounter();
  const deduplication = createCounter();
  const finalOutcome = createCounter();

  for (const result of run.cases) {
    evaluateNormalization(result, normalization);
    evaluateCanonicalUrl(result, canonicalUrl);
    evaluateFreshness(result, freshness);
    evaluateDeduplication(result, deduplication);
    evaluateFinalOutcome(result, finalOutcome);
  }

  const casesPassed = run.cases.filter((item) => item.passed).length;
  const casesTotal = run.cases.length;
  const casesFailed = casesTotal - casesPassed;

  return {
    casesTotal,
    casesPassed,
    casesFailed,

    passRate: calculateAccuracy(casesPassed, casesTotal),

    normalization: finalizeCounter(normalization),
    canonicalUrl: finalizeCounter(canonicalUrl),
    freshness: finalizeCounter(freshness),
    deduplication: finalizeCounter(deduplication),
    finalOutcome: finalizeCounter(finalOutcome),
  };
}

function evaluateNormalization(result: NewsEvaluationCaseResult, counter: MetricCounter): void {
  counter.evaluated += 1;

  const expected = result.expected.normalization;
  const actual = result.actual.normalization;

  if (expected.status !== actual.status) {
    return;
  }

  if (expected.status === 'rejected' && actual.status === 'rejected') {
    if (expected.reason === actual.reason) {
      counter.correct += 1;
    }

    return;
  }

  if (expected.status === 'accepted' && actual.status === 'accepted') {
    counter.correct += 1;
  }
}

function evaluateCanonicalUrl(result: NewsEvaluationCaseResult, counter: MetricCounter): void {
  const expected = result.expected.normalization;
  const actual = result.actual.normalization;

  if (expected.status !== 'accepted') {
    return;
  }

  counter.evaluated += 1;

  if (actual.status === 'accepted' && actual.canonicalUrl === expected.canonicalUrl) {
    counter.correct += 1;
  }
}

function evaluateFreshness(result: NewsEvaluationCaseResult, counter: MetricCounter): void {
  if (!('freshness' in result.expected)) {
    return;
  }

  counter.evaluated += 1;

  const actual = result.actual.freshness;

  if (actual === undefined) {
    return;
  }

  if (
    actual.accepted === result.expected.freshness.accepted &&
    actual.classification === result.expected.freshness.classification
  ) {
    counter.correct += 1;
  }
}

function evaluateDeduplication(result: NewsEvaluationCaseResult, counter: MetricCounter): void {
  if (!('deduplication' in result.expected)) {
    return;
  }

  counter.evaluated += 1;

  const expected = result.expected.deduplication;
  const actual = result.actual.deduplication;

  if (actual === undefined || actual.status !== expected.status) {
    return;
  }

  if (expected.status === 'unique' && actual.status === 'unique') {
    counter.correct += 1;
    return;
  }

  if (
    expected.status === 'duplicate' &&
    actual.status === 'duplicate' &&
    actual.reason === expected.reason &&
    actual.duplicateOfCaseId === expected.duplicateOfCaseId
  ) {
    counter.correct += 1;
  }
}

function evaluateFinalOutcome(result: NewsEvaluationCaseResult, counter: MetricCounter): void {
  counter.evaluated += 1;

  if (result.actual.finalOutcome === result.expected.finalOutcome) {
    counter.correct += 1;
  }
}

function createCounter(): MetricCounter {
  return {
    evaluated: 0,
    correct: 0,
  };
}

function finalizeCounter(counter: MetricCounter) {
  return {
    evaluated: counter.evaluated,
    correct: counter.correct,
    accuracy: calculateAccuracy(counter.correct, counter.evaluated),
  };
}

function calculateAccuracy(correct: number, evaluated: number): number {
  if (evaluated === 0) {
    return 1;
  }

  return correct / evaluated;
}
