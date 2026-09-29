import { describe, expect, it } from 'vitest';

import { deriveResearchExecutionResult } from '../src/research/research-result.js';

describe('research execution result', () => {
  it('marks sufficient selected coverage complete', () => {
    expect(
      deriveResearchExecutionResult({
        status: 'selected',
        selection: {
          sourceIds: ['source-1'],
          primarySourceCandidateIds: [],
          unresolvedQuestions: [],
          completionSuggestion: 'coverage-sufficient',
        },
        modelCalls: 2,
        toolCalls: 1,
      }),
    ).toEqual({
      outcome: 'complete',
      stopReason: 'criteria-satisfied',
      selection: {
        sourceIds: ['source-1'],
        primarySourceCandidateIds: [],
        unresolvedQuestions: [],
        completionSuggestion: 'coverage-sufficient',
      },
      modelCalls: 2,
      toolCalls: 1,
    });
  });

  it('marks incomplete selected coverage partial', () => {
    expect(
      deriveResearchExecutionResult({
        status: 'selected',
        selection: {
          sourceIds: ['source-1'],
          primarySourceCandidateIds: [],
          unresolvedQuestions: ['Primary source still missing'],
          completionSuggestion: 'coverage-incomplete',
        },
        modelCalls: 3,
        toolCalls: 2,
      }),
    ).toMatchObject({
      outcome: 'partial',
      stopReason: 'no-useful-results',
    });
  });

  it('marks zero selected sources insufficient', () => {
    expect(
      deriveResearchExecutionResult({
        status: 'selected',
        selection: {
          sourceIds: [],
          primarySourceCandidateIds: [],
          unresolvedQuestions: ['No useful sources found'],
          completionSuggestion: 'coverage-incomplete',
        },
        modelCalls: 2,
        toolCalls: 3,
      }),
    ).toMatchObject({
      outcome: 'insufficient-sources',
      stopReason: 'no-useful-results',
    });
  });

  it.each(['tool-budget-exhausted', 'model-budget-exhausted', 'deadline-exceeded'] as const)(
    'preserves bounded stop reason %s',
    (reason) => {
      expect(
        deriveResearchExecutionResult({
          status: 'stopped',
          reason,
          modelCalls: 2,
          toolCalls: 2,
        }),
      ).toEqual({
        outcome: 'partial',
        stopReason: reason,
        selection: null,
        modelCalls: 2,
        toolCalls: 2,
      });
    },
  );

  it('does not let sufficient suggestion override missing sources', () => {
    expect(
      deriveResearchExecutionResult({
        status: 'selected',
        selection: {
          sourceIds: [],
          primarySourceCandidateIds: [],
          unresolvedQuestions: [],
          completionSuggestion: 'coverage-sufficient',
        },
        modelCalls: 2,
        toolCalls: 0,
      }),
    ).toMatchObject({
      outcome: 'insufficient-sources',
      stopReason: 'no-useful-results',
    });
  });
});
