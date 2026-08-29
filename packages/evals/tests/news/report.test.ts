import { describe, expect, it } from 'vitest';

import {
  evaluateNewsCorpus,
  evaluateNewsRegression,
  formatNewsEvaluationReport,
  type NewsEvaluationCorpus,
} from '../../src/index.js';

import { contractFixture } from './fixtures/contract-fixture.js';

describe('formatNewsEvaluationReport', () => {
  it('formats a passing deterministic evaluation report', () => {
    const run = evaluateNewsCorpus(contractFixture);
    const regression = evaluateNewsRegression(run);

    const report = formatNewsEvaluationReport(run, regression);

    expect(report).toContain('Phase 1 News Evaluation');
    expect(report).toContain('Corpus: phase1-contract-fixture');
    expect(report).toContain('Cases:            4/4 passed');
    expect(report).toContain('Pass rate:        100.00%');
    expect(report).toContain('Normalization:    100.00%');
    expect(report).toContain('Canonical URL:    100.00%');
    expect(report).toContain('Freshness:        100.00%');
    expect(report).toContain('Deduplication:    100.00%');
    expect(report).toContain('Final outcome:    100.00%');
    expect(report).toContain('REGRESSION: PASS');
  });

  it('includes failure details for a regression', () => {
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
                  canonicalUrl: 'https://example.com/incorrect',
                },
              },
            }
          : evaluationCase,
      ),
    };

    const run = evaluateNewsCorpus(corpus);
    const regression = evaluateNewsRegression(run);

    const report = formatNewsEvaluationReport(run, regression);

    expect(report).toContain('REGRESSION: FAIL');
    expect(report).toContain('Case: retained-basic');

    expect(report).toContain(
      'canonicalUrl expected https://example.com/incorrect but received https://example.com/story',
    );
  });
});
