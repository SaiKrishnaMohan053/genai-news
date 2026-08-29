import { describe, expect, it } from 'vitest';

import { validateNewsEvaluationCorpus, type NewsEvaluationCorpus } from '../../src/index.js';

import { contractFixture } from './fixtures/contract-fixture.js';

describe('news evaluation corpus contracts', () => {
  it('accepts a valid deterministic corpus', () => {
    expect(() => validateNewsEvaluationCorpus(contractFixture)).not.toThrow();
  });

  it('rejects duplicate case ids', () => {
    const corpus: NewsEvaluationCorpus = {
      ...contractFixture,
      cases: [
        contractFixture.cases[0]!,
        {
          ...contractFixture.cases[0]!,
        },
      ],
    };

    expect(() => validateNewsEvaluationCorpus(corpus)).toThrow('Duplicate evaluation case id');
  });

  it('rejects duplicate expectations that reference a later or missing case', () => {
    const duplicateCase = contractFixture.cases[1]!;

    const corpus: NewsEvaluationCorpus = {
      ...contractFixture,
      cases: [duplicateCase],
    };

    expect(() => validateNewsEvaluationCorpus(corpus)).toThrow('must reference an earlier case');
  });

  it('rejects an invalid evaluation clock', () => {
    const corpus: NewsEvaluationCorpus = {
      ...contractFixture,
      now: new Date('invalid'),
    };

    expect(() => validateNewsEvaluationCorpus(corpus)).toThrow('corpus.now must be a valid Date');
  });
});
