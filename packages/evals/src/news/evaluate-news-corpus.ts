import {
  deduplicateArticles,
  evaluateArticleFreshness,
  normalizeSourceArticle,
  type NormalizedArticle,
} from '@genai-news/shared';

import type {
  NewsEvaluationCase,
  NewsEvaluationCaseActual,
  NewsEvaluationCaseResult,
  NewsEvaluationCorpus,
  NewsEvaluationRunResult,
} from './contracts.js';

import { validateNewsEvaluationCorpus } from './validate-corpus.js';

type AcceptedFreshCase = {
  caseId: string;
  article: NormalizedArticle;
};

export function evaluateNewsCorpus(corpus: NewsEvaluationCorpus): NewsEvaluationRunResult {
  validateNewsEvaluationCorpus(corpus);

  const actualByCaseId = new Map<string, NewsEvaluationCaseActual>();
  const freshCases: AcceptedFreshCase[] = [];

  for (const evaluationCase of corpus.cases) {
    const normalization = normalizeSourceArticle({
      source: evaluationCase.source,
      article: evaluationCase.article,
      discoveredAt: evaluationCase.discoveredAt,
    });

    if (normalization.status === 'rejected') {
      actualByCaseId.set(evaluationCase.id, {
        normalization: {
          status: 'rejected',
          reason: normalization.reason,
        },
        finalOutcome: 'rejected-normalization',
      });

      continue;
    }

    const freshness = evaluateArticleFreshness({
      article: normalization.article,
      policy: corpus.freshnessPolicy,
      now: corpus.now,
    });

    if (!freshness.accepted) {
      actualByCaseId.set(evaluationCase.id, {
        normalization: {
          status: 'accepted',
          canonicalUrl: normalization.article.canonicalUrl,
        },
        freshness: {
          accepted: false,
          classification: freshness.classification,
        },
        finalOutcome: 'rejected-freshness',
      });

      continue;
    }

    actualByCaseId.set(evaluationCase.id, {
      normalization: {
        status: 'accepted',
        canonicalUrl: normalization.article.canonicalUrl,
      },
      freshness: {
        accepted: true,
        classification: freshness.classification,
      },
      finalOutcome: 'retained',
    });

    freshCases.push({
      caseId: evaluationCase.id,
      article: normalization.article,
    });
  }

  applyDeduplication(actualByCaseId, freshCases);

  return {
    corpusId: corpus.id,
    cases: corpus.cases.map((evaluationCase) =>
      buildCaseResult(evaluationCase, getActual(actualByCaseId, evaluationCase.id)),
    ),
  };
}

function applyDeduplication(
  actualByCaseId: Map<string, NewsEvaluationCaseActual>,
  freshCases: readonly AcceptedFreshCase[],
): void {
  if (freshCases.length === 0) {
    return;
  }

  const deduplication = deduplicateArticles(freshCases.map((item) => item.article));

  const caseIdByArticle = new Map<NormalizedArticle, string>();

  for (const item of freshCases) {
    caseIdByArticle.set(item.article, item.caseId);
  }

  for (const uniqueArticle of deduplication.uniqueArticles) {
    const caseId = getCaseIdForArticle(caseIdByArticle, uniqueArticle);
    const current = getActual(actualByCaseId, caseId);

    actualByCaseId.set(caseId, {
      ...current,
      deduplication: {
        status: 'unique',
      },
      finalOutcome: 'retained',
    });
  }

  for (const duplicate of deduplication.duplicates) {
    const duplicateCaseId = getCaseIdForArticle(caseIdByArticle, duplicate.article);

    const originalCaseId = getCaseIdForArticle(caseIdByArticle, duplicate.originalArticle);

    const current = getActual(actualByCaseId, duplicateCaseId);

    actualByCaseId.set(duplicateCaseId, {
      ...current,
      deduplication: {
        status: 'duplicate',
        reason: duplicate.reason,
        duplicateOfCaseId: originalCaseId,
      },
      finalOutcome: 'duplicate',
    });
  }
}

function buildCaseResult(
  evaluationCase: NewsEvaluationCase,
  actual: NewsEvaluationCaseActual,
): NewsEvaluationCaseResult {
  const failures = compareCase(evaluationCase, actual);

  return {
    caseId: evaluationCase.id,
    description: evaluationCase.description,
    expected: evaluationCase.expected,
    actual,
    passed: failures.length === 0,
    failures,
  };
}

function compareCase(
  evaluationCase: NewsEvaluationCase,
  actual: NewsEvaluationCaseActual,
): string[] {
  const failures: string[] = [];
  const expected = evaluationCase.expected;

  if (actual.normalization.status !== expected.normalization.status) {
    failures.push(
      `normalization status expected ${expected.normalization.status} but received ${actual.normalization.status}`,
    );

    return failures;
  }

  if (expected.normalization.status === 'rejected' && actual.normalization.status === 'rejected') {
    if (actual.normalization.reason !== expected.normalization.reason) {
      failures.push(
        `normalization reason expected ${expected.normalization.reason} but received ${actual.normalization.reason}`,
      );
    }

    compareFinalOutcome(expected.finalOutcome, actual.finalOutcome, failures);
    return failures;
  }

  if (expected.normalization.status === 'accepted' && actual.normalization.status === 'accepted') {
    if (actual.normalization.canonicalUrl !== expected.normalization.canonicalUrl) {
      failures.push(
        `canonicalUrl expected ${expected.normalization.canonicalUrl} but received ${actual.normalization.canonicalUrl}`,
      );
    }
  }

  if ('freshness' in expected) {
    if (actual.freshness === undefined) {
      failures.push('freshness result was expected but missing');
    } else {
      if (actual.freshness.accepted !== expected.freshness.accepted) {
        failures.push(
          `freshness accepted expected ${expected.freshness.accepted} but received ${actual.freshness.accepted}`,
        );
      }

      if (actual.freshness.classification !== expected.freshness.classification) {
        failures.push(
          `freshness classification expected ${expected.freshness.classification} but received ${actual.freshness.classification}`,
        );
      }
    }
  }

  if ('deduplication' in expected) {
    if (actual.deduplication === undefined) {
      failures.push('deduplication result was expected but missing');
    } else if (actual.deduplication.status !== expected.deduplication.status) {
      failures.push(
        `deduplication status expected ${expected.deduplication.status} but received ${actual.deduplication.status}`,
      );
    } else if (
      expected.deduplication.status === 'duplicate' &&
      actual.deduplication.status === 'duplicate'
    ) {
      if (actual.deduplication.reason !== expected.deduplication.reason) {
        failures.push(
          `duplicate reason expected ${expected.deduplication.reason} but received ${actual.deduplication.reason}`,
        );
      }

      if (actual.deduplication.duplicateOfCaseId !== expected.deduplication.duplicateOfCaseId) {
        failures.push(
          `duplicateOfCaseId expected ${expected.deduplication.duplicateOfCaseId} but received ${actual.deduplication.duplicateOfCaseId}`,
        );
      }
    }
  }

  compareFinalOutcome(expected.finalOutcome, actual.finalOutcome, failures);

  return failures;
}

function compareFinalOutcome(expected: string, actual: string, failures: string[]): void {
  if (actual !== expected) {
    failures.push(`finalOutcome expected ${expected} but received ${actual}`);
  }
}

function getActual(
  actualByCaseId: ReadonlyMap<string, NewsEvaluationCaseActual>,
  caseId: string,
): NewsEvaluationCaseActual {
  const actual = actualByCaseId.get(caseId);

  if (actual === undefined) {
    throw new Error(`Missing evaluation result for case: ${caseId}`);
  }

  return actual;
}

function getCaseIdForArticle(
  caseIdByArticle: ReadonlyMap<NormalizedArticle, string>,
  article: NormalizedArticle,
): string {
  const caseId = caseIdByArticle.get(article);

  if (caseId === undefined) {
    throw new Error('Deduplication returned an article not present in the evaluation batch.');
  }

  return caseId;
}
