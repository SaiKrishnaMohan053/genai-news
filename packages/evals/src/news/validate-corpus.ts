import type { NewsEvaluationCorpus } from './contracts.js';

export function validateNewsEvaluationCorpus(corpus: NewsEvaluationCorpus): void {
  validateDate(corpus.now, 'corpus.now');

  if (!Number.isFinite(corpus.freshnessPolicy.maxAgeMs) || corpus.freshnessPolicy.maxAgeMs < 0) {
    throw new Error('Evaluation freshnessPolicy.maxAgeMs must be a finite non-negative number.');
  }

  if (
    !Number.isFinite(corpus.freshnessPolicy.maxFutureSkewMs) ||
    corpus.freshnessPolicy.maxFutureSkewMs < 0
  ) {
    throw new Error(
      'Evaluation freshnessPolicy.maxFutureSkewMs must be a finite non-negative number.',
    );
  }

  const seenCaseIds = new Set<string>();

  for (const evaluationCase of corpus.cases) {
    if (evaluationCase.id.trim() === '') {
      throw new Error('Evaluation case id must not be empty.');
    }

    if (seenCaseIds.has(evaluationCase.id)) {
      throw new Error(`Duplicate evaluation case id: ${evaluationCase.id}`);
    }

    validateDate(evaluationCase.discoveredAt, `case ${evaluationCase.id} discoveredAt`);

    if (
      evaluationCase.expected.finalOutcome === 'duplicate' &&
      !seenCaseIds.has(evaluationCase.expected.deduplication.duplicateOfCaseId)
    ) {
      throw new Error(
        `Duplicate case ${evaluationCase.id} must reference an earlier case: ${evaluationCase.expected.deduplication.duplicateOfCaseId}`,
      );
    }

    seenCaseIds.add(evaluationCase.id);
  }
}

function validateDate(value: Date, field: string): void {
  if (Number.isNaN(value.getTime())) {
    throw new Error(`${field} must be a valid Date.`);
  }
}
