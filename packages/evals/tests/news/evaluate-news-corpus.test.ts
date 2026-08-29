import { describe, expect, it } from 'vitest';

import { evaluateNewsCorpus, type NewsEvaluationCorpus } from '../../src/index.js';

import { contractFixture } from './fixtures/contract-fixture.js';

describe('evaluateNewsCorpus', () => {
  it('produces passing results for the deterministic contract fixture', () => {
    const result = evaluateNewsCorpus(contractFixture);

    expect(result.corpusId).toBe('phase1-contract-fixture');
    expect(result.cases).toHaveLength(4);

    expect(result.cases.every((item) => item.passed)).toBe(true);
    expect(result.cases.flatMap((item) => item.failures)).toEqual([]);
  });

  it('detects a canonical URL expectation mismatch', () => {
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

    const result = evaluateNewsCorpus(corpus);

    const failedCase = result.cases.find((item) => item.caseId === 'retained-basic');

    expect(failedCase?.passed).toBe(false);
    expect(failedCase?.failures).toContain(
      'canonicalUrl expected https://example.com/wrong but received https://example.com/story',
    );
  });

  it('detects an incorrect duplicate expectation', () => {
    const corpus: NewsEvaluationCorpus = {
      ...contractFixture,
      cases: contractFixture.cases.map((evaluationCase) =>
        evaluationCase.id === 'duplicate-canonical-url' &&
        'deduplication' in evaluationCase.expected &&
        evaluationCase.expected.deduplication.status === 'duplicate'
          ? {
              ...evaluationCase,
              expected: {
                ...evaluationCase.expected,
                deduplication: {
                  ...evaluationCase.expected.deduplication,
                  reason: 'publisher-title' as const,
                },
              },
            }
          : evaluationCase,
      ),
    };

    const result = evaluateNewsCorpus(corpus);

    const failedCase = result.cases.find((item) => item.caseId === 'duplicate-canonical-url');

    expect(failedCase?.passed).toBe(false);
    expect(failedCase?.failures).toContain(
      'duplicate reason expected publisher-title but received canonical-url',
    );
  });

  it('preserves deterministic results across repeated runs', () => {
    const first = evaluateNewsCorpus(contractFixture);
    const second = evaluateNewsCorpus(contractFixture);

    expect(second).toEqual(first);
  });
});
