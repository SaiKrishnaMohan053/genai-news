import {
  deriveResearchExecutionResult,
  runResearchAgent,
  type ResearchRunnerInput,
  type ResearchRunnerResult,
} from '@genai-news/agents';

import type { ResearchContext } from '@genai-news/shared';

import type {
  ResearchExecutionInput,
  ResearchExecutionResult,
  ResearchExecutor,
} from '../jobs/research.js';

export type ResearchRunnerRuntime = Omit<ResearchRunnerInput, 'budget'>;

export type ResearchRunnerRuntimeFactory = (
  input: ResearchExecutionInput,
) => Promise<ResearchRunnerRuntime>;

export type CreateResearchAgentExecutorOptions = {
  createRuntime: ResearchRunnerRuntimeFactory;

  runAgent?: (input: ResearchRunnerInput) => Promise<ResearchRunnerResult>;
};

export function createResearchAgentExecutor(
  options: CreateResearchAgentExecutorOptions,
): ResearchExecutor {
  const runAgent = options.runAgent ?? runResearchAgent;

  return async (input: ResearchExecutionInput): Promise<ResearchExecutionResult> => {
    const runtime = await options.createRuntime(input);

    assertRuntimeMatchesExecution(runtime.context, input);

    const runnerResult = await runAgent({
      ...runtime,

      budget: input.budget,
    });

    const result = deriveResearchExecutionResult(runnerResult);

    /*
     * deriveResearchExecutionResult currently maps
     * every normal runner terminal state to:
     *
     * complete
     * partial
     * insufficient-sources
     *
     * A failed outcome belongs to exceptional worker
     * execution and is persisted by processResearchJob.
     */
    if (result.outcome === 'failed') {
      throw new Error('Research runner returned an unexpected failed outcome.');
    }

    if (result.stopReason === 'terminal-failure') {
      throw new Error('Research runner returned an unexpected terminal-failure stop reason.');
    }

    return {
      outcome: result.outcome,

      stopReason: result.stopReason,

      selection: result.selection,

      modelCalls: result.modelCalls,

      toolCalls: result.toolCalls,
    };
  };
}

function assertRuntimeMatchesExecution(
  context: ResearchContext,
  input: ResearchExecutionInput,
): void {
  if (context.researchRunId !== input.researchRunId) {
    throw new Error('Research runtime belongs to a different research run.');
  }

  if (context.story.id !== input.storyId || context.request.storyId !== input.storyId) {
    throw new Error('Research runtime belongs to a different story.');
  }

  const runtimeGoal = context.request.researchGoal ?? null;

  if (runtimeGoal !== input.researchGoal) {
    throw new Error('Research runtime goal does not match persisted research state.');
  }
}
