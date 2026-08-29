import {
  ARTICLE_DEDUP_KEY_TYPES,
  ARTICLE_NORMALIZATION_REJECTION_REASONS,
} from '@genai-news/shared';

import { describe, expect, it } from 'vitest';

import { evaluateNewsCorpus, evaluateNewsRegression } from '../../src/index.js';

import { phase1NewsBaseline } from '../../src/news/baselines/phase1-baseline.js';

describe('phase1NewsBaseline', () => {
  it('passes the strict deterministic regression policy', () => {
    const run = evaluateNewsCorpus(phase1NewsBaseline);
    const regression = evaluateNewsRegression(run);

    expect(run.cases).toHaveLength(17);

    expect(regression.passed).toBe(true);
    expect(regression.failures).toEqual([]);

    expect(regression.aggregate).toEqual({
      casesTotal: 17,
      casesPassed: 17,
      casesFailed: 0,

      passRate: 1,

      normalization: {
        evaluated: 17,
        correct: 17,
        accuracy: 1,
      },

      canonicalUrl: {
        evaluated: 11,
        correct: 11,
        accuracy: 1,
      },

      freshness: {
        evaluated: 11,
        correct: 11,
        accuracy: 1,
      },

      deduplication: {
        evaluated: 8,
        correct: 8,
        accuracy: 1,
      },

      finalOutcome: {
        evaluated: 17,
        correct: 17,
        accuracy: 1,
      },
    });
  });

  it('covers every deterministic normalization rejection reason', () => {
    const coveredReasons = new Set(
      phase1NewsBaseline.cases.flatMap((evaluationCase) =>
        evaluationCase.expected.normalization.status === 'rejected'
          ? [evaluationCase.expected.normalization.reason]
          : [],
      ),
    );

    expect([...coveredReasons].sort()).toEqual([...ARTICLE_NORMALIZATION_REJECTION_REASONS].sort());
  });

  it('covers every deterministic deduplication reason', () => {
    const coveredReasons = new Set(
      phase1NewsBaseline.cases.flatMap((evaluationCase) => {
        if (
          !('deduplication' in evaluationCase.expected) ||
          evaluationCase.expected.deduplication.status !== 'duplicate'
        ) {
          return [];
        }

        return [evaluationCase.expected.deduplication.reason];
      }),
    );

    expect([...coveredReasons].sort()).toEqual([...ARTICLE_DEDUP_KEY_TYPES].sort());
  });

  it('covers important freshness boundary and rejection behavior', () => {
    const classifications = new Set(
      phase1NewsBaseline.cases.flatMap((evaluationCase) =>
        'freshness' in evaluationCase.expected
          ? [evaluationCase.expected.freshness.classification]
          : [],
      ),
    );

    expect(classifications).toEqual(
      new Set(['fresh', 'stale', 'missing-published-at', 'future-published-at']),
    );

    expect(
      phase1NewsBaseline.cases.some(
        (evaluationCase) => evaluationCase.id === 'retained-max-age-boundary',
      ),
    ).toBe(true);

    expect(
      phase1NewsBaseline.cases.some(
        (evaluationCase) => evaluationCase.id === 'retained-future-skew-boundary',
      ),
    ).toBe(true);
  });
});
