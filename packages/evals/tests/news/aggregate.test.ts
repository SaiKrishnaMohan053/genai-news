import { describe, expect, it } from 'vitest';

import {
  aggregateNewsEvaluation,
  evaluateNewsCorpus,
  evaluateNewsRegression,
  STRICT_NEWS_EVALUATION_POLICY,
  type NewsEvaluationCorpus,
} from '../../src/index.js';

import { contractFixture } from './fixtures/contract-fixture.js';

describe('aggregateNewsEvaluation', () => {
  it('produces perfect metrics for the deterministic fixture', () => {
    const run = evaluateNewsCorpus(contractFixture);

    const aggregate = aggregateNewsEvaluation(run);

    expect(aggregate).toEqual({
      casesTotal: 4,
      casesPassed: 4,
      casesFailed: 0,

      passRate: 1,

      normalization: {
        evaluated: 4,
        correct: 4,
        accuracy: 1,
      },

      canonicalUrl: {
        evaluated: 3,
        correct: 3,
        accuracy: 1,
      },

      freshness: {
        evaluated: 3,
        correct: 3,
        accuracy: 1,
      },

      deduplication: {
        evaluated: 2,
        correct: 2,
        accuracy: 1,
      },

      finalOutcome: {
        evaluated: 4,
        correct: 4,
        accuracy: 1,
      },
    });
  });

  it('captures a deterministic canonical URL regression', () => {
    const corpus: NewsEvaluationCorpus = {
      ...contractFixture,
      cases: contractFixture.cases.map((evaluationCase) =>
        evaluationCase.id === 'retained-basic' &&
        evaluationCase.expected.normalization.status === 'accepted'
          ? {
              ...evaluationCase,
              expected: {
                ...evaluationCase.expected,
                normalization: {
                  ...evaluationCase.expected.normalization,
                  canonicalUrl: 'https://example.com/wrong',
                },
              },
            }
          : evaluationCase,
      ),
    };

    const aggregate = aggregateNewsEvaluation(evaluateNewsCorpus(corpus));

    expect(aggregate.casesFailed).toBe(1);
    expect(aggregate.passRate).toBe(0.75);

    expect(aggregate.canonicalUrl).toEqual({
      evaluated: 3,
      correct: 2,
      accuracy: 2 / 3,
    });
  });
});

describe('evaluateNewsRegression', () => {
  it('passes the strict policy when all cases pass', () => {
    const result = evaluateNewsRegression(evaluateNewsCorpus(contractFixture));

    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.policy).toEqual(STRICT_NEWS_EVALUATION_POLICY);
  });

  it('fails the strict policy when any case regresses', () => {
    const corpus: NewsEvaluationCorpus = {
      ...contractFixture,
      cases: contractFixture.cases.map((evaluationCase) =>
        evaluationCase.id === 'retained-basic' &&
        evaluationCase.expected.normalization.status === 'accepted'
          ? {
              ...evaluationCase,
              expected: {
                ...evaluationCase.expected,
                normalization: {
                  ...evaluationCase.expected.normalization,
                  canonicalUrl: 'https://example.com/wrong',
                },
              },
            }
          : evaluationCase,
      ),
    };

    const result = evaluateNewsRegression(evaluateNewsCorpus(corpus));

    expect(result.passed).toBe(false);
    expect(result.aggregate.casesFailed).toBe(1);

    expect(result.failures).toContain('pass rate 0.75 is below minimum 1');

    expect(result.failures).toContain('1 evaluation case(s) failed');
  });

  it('rejects an invalid regression policy', () => {
    expect(() =>
      evaluateNewsRegression(evaluateNewsCorpus(contractFixture), {
        minimumPassRate: 1.1,
        requireZeroFailures: true,
      }),
    ).toThrow('minimumPassRate must be a finite number between 0 and 1.');
  });
});
