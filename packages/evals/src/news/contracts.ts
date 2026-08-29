import type {
  ArticleDedupKeyType,
  ArticleFreshnessClassification,
  ArticleNormalizationRejectionReason,
  FreshnessPolicy,
} from '@genai-news/shared';

export const NEWS_EVALUATION_FINAL_OUTCOMES = [
  'retained',
  'rejected-normalization',
  'rejected-freshness',
  'duplicate',
] as const;

export type NewsEvaluationFinalOutcome = (typeof NEWS_EVALUATION_FINAL_OUTCOMES)[number];

export type AcceptedNormalizationExpectation = {
  status: 'accepted';
  canonicalUrl: string;
};

export type RejectedNormalizationExpectation = {
  status: 'rejected';
  reason: ArticleNormalizationRejectionReason;
};

export type AcceptedFreshnessExpectation = {
  accepted: true;
  classification: ArticleFreshnessClassification;
};

export type RejectedFreshnessExpectation = {
  accepted: false;
  classification: ArticleFreshnessClassification;
};

export type UniqueDeduplicationExpectation = {
  status: 'unique';
};

export type DuplicateDeduplicationExpectation = {
  status: 'duplicate';
  reason: ArticleDedupKeyType;
  duplicateOfCaseId: string;
};

export type NormalizationRejectedEvaluationCase = {
  id: string;
  description: string;

  source: unknown;
  article: unknown;
  discoveredAt: Date;

  expected: {
    normalization: RejectedNormalizationExpectation;
    finalOutcome: 'rejected-normalization';
  };
};

export type FreshnessRejectedEvaluationCase = {
  id: string;
  description: string;

  source: unknown;
  article: unknown;
  discoveredAt: Date;

  expected: {
    normalization: AcceptedNormalizationExpectation;
    freshness: RejectedFreshnessExpectation;
    finalOutcome: 'rejected-freshness';
  };
};

export type RetainedEvaluationCase = {
  id: string;
  description: string;

  source: unknown;
  article: unknown;
  discoveredAt: Date;

  expected: {
    normalization: AcceptedNormalizationExpectation;
    freshness: AcceptedFreshnessExpectation;
    deduplication: UniqueDeduplicationExpectation;
    finalOutcome: 'retained';
  };
};

export type DuplicateEvaluationCase = {
  id: string;
  description: string;

  source: unknown;
  article: unknown;
  discoveredAt: Date;

  expected: {
    normalization: AcceptedNormalizationExpectation;
    freshness: AcceptedFreshnessExpectation;
    deduplication: DuplicateDeduplicationExpectation;
    finalOutcome: 'duplicate';
  };
};

export type NewsEvaluationCase =
  | NormalizationRejectedEvaluationCase
  | FreshnessRejectedEvaluationCase
  | RetainedEvaluationCase
  | DuplicateEvaluationCase;

export type NewsEvaluationCorpus = {
  id: string;
  description: string;

  now: Date;
  freshnessPolicy: FreshnessPolicy;

  cases: readonly NewsEvaluationCase[];
};

export type NewsEvaluationCaseActual = {
  normalization:
    | {
        status: 'accepted';
        canonicalUrl: string;
      }
    | {
        status: 'rejected';
        reason: ArticleNormalizationRejectionReason;
      };

  freshness?:
    | {
        accepted: true;
        classification: ArticleFreshnessClassification;
      }
    | {
        accepted: false;
        classification: ArticleFreshnessClassification;
      };

  deduplication?:
    | {
        status: 'unique';
      }
    | {
        status: 'duplicate';
        reason: ArticleDedupKeyType;
        duplicateOfCaseId: string;
      };

  finalOutcome: NewsEvaluationFinalOutcome;
};

export type NewsEvaluationCaseResult = {
  caseId: string;
  description: string;

  expected: NewsEvaluationCase['expected'];
  actual: NewsEvaluationCaseActual;

  passed: boolean;
  failures: readonly string[];
};

export type NewsEvaluationRunResult = {
  corpusId: string;
  cases: readonly NewsEvaluationCaseResult[];
};

export type NewsEvaluationAggregate = {
  casesTotal: number;
  casesPassed: number;
  casesFailed: number;

  passRate: number;

  normalization: {
    evaluated: number;
    correct: number;
    accuracy: number;
  };

  canonicalUrl: {
    evaluated: number;
    correct: number;
    accuracy: number;
  };

  freshness: {
    evaluated: number;
    correct: number;
    accuracy: number;
  };

  deduplication: {
    evaluated: number;
    correct: number;
    accuracy: number;
  };

  finalOutcome: {
    evaluated: number;
    correct: number;
    accuracy: number;
  };
};

export type NewsEvaluationRegressionPolicy = {
  minimumPassRate: number;
  requireZeroFailures: boolean;
};

export type NewsEvaluationRegressionResult = {
  passed: boolean;

  aggregate: NewsEvaluationAggregate;
  policy: NewsEvaluationRegressionPolicy;

  failures: readonly string[];
};
