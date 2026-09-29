import {
  isToolMessage,
  type BaseMessage,
  type ToolCall,
  type ToolMessage,
} from '@langchain/core/messages';

import {
  validateResearchAgentSelection,
  type ResearchAgentSelection,
  type ResearchBudget,
  type ResearchContext,
  type ResearchSourceCatalog,
} from '@genai-news/shared';

import { ResearchExecutionBudgetError } from './execution-policy.js';
import { ResearchExecutionDeadlineError, ResearchExecutionScope } from './execution-scope.js';
import type { ResearchStructuredOutputModel, ResearchToolCallingModel } from './model.js';
import { createResearchAgentMessages } from './research-messages.js';
import { createResearchTools, type ResearchToolPorts } from './tools.js';

export type ResearchRunnerInput = Readonly<{
  context: ResearchContext;
  budget: ResearchBudget;

  getCatalog(): ResearchSourceCatalog;

  toolCallingModel: ResearchToolCallingModel;
  structuredOutputModel: ResearchStructuredOutputModel;
  toolPorts: ResearchToolPorts;

  signal?: AbortSignal;
}>;

export type ResearchRunnerResult =
  | Readonly<{
      status: 'selected';
      selection: ResearchAgentSelection;
      modelCalls: number;
      toolCalls: number;
    }>
  | Readonly<{
      status: 'stopped';
      reason: 'tool-budget-exhausted' | 'model-budget-exhausted' | 'deadline-exceeded';
      modelCalls: number;
      toolCalls: number;
    }>;

export async function runResearchAgent(input: ResearchRunnerInput): Promise<ResearchRunnerResult> {
  const initialCatalog = input.getCatalog();

  const messages: BaseMessage[] = [
    ...createResearchAgentMessages({
      context: input.context,
      catalog: initialCatalog,
      budget: input.budget,
    }),
  ];

  const tools = createResearchTools(
    {
      researchRunId: input.context.researchRunId,
      storyId: input.context.story.id,
    },
    input.toolPorts,
  );

  const scope = new ResearchExecutionScope({
    budget: input.budget,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });

  try {
    for (;;) {
      scope.throwIfAborted();

      try {
        scope.policy.reserveModelCall();
      } catch (error) {
        return stoppedFromBudgetError(error, scope);
      }

      const aiMessage = await input.toolCallingModel.invoke(messages, {
        signal: scope.signal,
        timeout: scope.policy.getRemainingTimeoutMs(),
      });

      scope.throwIfAborted();

      messages.push(aiMessage);

      const toolCalls = aiMessage.tool_calls ?? [];

      if (toolCalls.length === 0) {
        break;
      }

      for (const toolCall of toolCalls) {
        try {
          scope.policy.reserveToolCall();
        } catch (error) {
          return stoppedFromBudgetError(error, scope);
        }

        const toolMessage = await invokeResearchTool(tools, toolCall, scope.signal);

        scope.throwIfAborted();

        messages.push(toolMessage);

        scope.throwIfAborted();

        messages.push(toolMessage);
      }
    }

    try {
      scope.policy.reserveModelCall();
    } catch (error) {
      return stoppedFromBudgetError(error, scope);
    }

    const selection = await input.structuredOutputModel.invoke(messages, {
      signal: scope.signal,
      timeout: scope.policy.getRemainingTimeoutMs(),
    });

    scope.throwIfAborted();

    const latestCatalog = input.getCatalog();

    const validated = validateResearchAgentSelection(
      selection,
      latestCatalog,
      input.context,
      input.budget,
    );

    const snapshot = scope.policy.getSnapshot();

    return {
      status: 'selected',
      selection: validated,
      modelCalls: snapshot.modelCalls,
      toolCalls: snapshot.toolCalls,
    };
  } catch (error) {
    if (error instanceof ResearchExecutionDeadlineError || scope.getDeadlineExceeded()) {
      const snapshot = scope.policy.getSnapshot();

      return {
        status: 'stopped',
        reason: 'deadline-exceeded',
        modelCalls: snapshot.modelCalls,
        toolCalls: snapshot.toolCalls,
      };
    }

    if (input.signal?.aborted) {
      input.signal.throwIfAborted();
    }

    throw error;
  } finally {
    scope.dispose();
  }
}

function stoppedFromBudgetError(
  error: unknown,
  scope: ResearchExecutionScope,
): ResearchRunnerResult {
  if (!(error instanceof ResearchExecutionBudgetError)) {
    throw error;
  }

  const snapshot = scope.policy.getSnapshot();

  return {
    status: 'stopped',
    reason: error.stopReason,
    modelCalls: snapshot.modelCalls,
    toolCalls: snapshot.toolCalls,
  };
}

async function invokeResearchTool(
  tools: ReturnType<typeof createResearchTools>,
  toolCall: ToolCall,
  signal: AbortSignal,
): Promise<ToolMessage> {
  let message: unknown;

  switch (toolCall.name) {
    case 'search_news':
      message = await tools.search_news.invoke(
        {
          ...toolCall,
          name: 'search_news',
        },
        { signal },
      );
      break;

    case 'fetch_article':
      message = await tools.fetch_article.invoke(
        {
          ...toolCall,
          name: 'fetch_article',
        },
        { signal },
      );
      break;

    case 'search_official_source':
      message = await tools.search_official_source.invoke(
        {
          ...toolCall,
          name: 'search_official_source',
        },
        { signal },
      );
      break;

    case 'find_related_sources':
      message = await tools.find_related_sources.invoke(
        {
          ...toolCall,
          name: 'find_related_sources',
        },
        { signal },
      );
      break;

    default:
      throw new Error('Research model requested an unknown tool.');
  }

  if (!isToolMessage(message)) {
    throw new Error('Research tool did not return a ToolMessage.');
  }

  return message;
}
