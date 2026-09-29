import type {
  ResearchAgentSelection,
  ResearchOutcome,
  ResearchStopReason,
} from '@genai-news/shared';

import type { ResearchRunnerResult } from './research-runner.js';

export type ResearchExecutionResult = Readonly<{
  outcome: ResearchOutcome;
  stopReason: ResearchStopReason;

  selection: ResearchAgentSelection | null;

  modelCalls: number;
  toolCalls: number;
}>;

export function deriveResearchExecutionResult(
  result: ResearchRunnerResult,
): ResearchExecutionResult {
  if (result.status === 'stopped') {
    return Object.freeze({
      outcome: deriveStoppedOutcome(result.reason),
      stopReason: result.reason,
      selection: null,
      modelCalls: result.modelCalls,
      toolCalls: result.toolCalls,
    });
  }

  const selection = result.selection;

  if (selection.completionSuggestion === 'coverage-sufficient' && selection.sourceIds.length > 0) {
    return Object.freeze({
      outcome: 'complete',
      stopReason: 'criteria-satisfied',
      selection,
      modelCalls: result.modelCalls,
      toolCalls: result.toolCalls,
    });
  }

  if (selection.sourceIds.length > 0) {
    return Object.freeze({
      outcome: 'partial',
      stopReason: 'no-useful-results',
      selection,
      modelCalls: result.modelCalls,
      toolCalls: result.toolCalls,
    });
  }

  return Object.freeze({
    outcome: 'insufficient-sources',
    stopReason: 'no-useful-results',
    selection,
    modelCalls: result.modelCalls,
    toolCalls: result.toolCalls,
  });
}

function deriveStoppedOutcome(
  reason: 'tool-budget-exhausted' | 'model-budget-exhausted' | 'deadline-exceeded',
): ResearchOutcome {
  switch (reason) {
    case 'tool-budget-exhausted':
    case 'model-budget-exhausted':
    case 'deadline-exceeded':
      return 'partial';
  }
}
