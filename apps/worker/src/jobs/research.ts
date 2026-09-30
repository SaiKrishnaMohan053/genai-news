import crypto from 'node:crypto';

import type { ResearchRunRepository } from '@genai-news/database';

import { researchJobSchema, type ResearchJobPayload } from '@genai-news/schemas';

import type {
  ResearchAgentSelection,
  ResearchOutcome,
  ResearchStopReason,
} from '@genai-news/shared';

const DEFAULT_LEASE_SAFETY_BUFFER_MS = 30_000;

export type ResearchExecutionResult = {
  outcome: Exclude<ResearchOutcome, 'failed'>;

  stopReason: Exclude<ResearchStopReason, 'terminal-failure'>;

  selection: ResearchAgentSelection | null;

  modelCalls: number;
  toolCalls: number;
};

export type ResearchExecutionInput = {
  researchRunId: string;

  storyId: string;

  researchGoal: string | null;

  budget: {
    maxToolCalls: number;
    maxModelCalls: number;
    timeoutMs: number;
    maxSelectedSources: number;
    maxUnresolvedQuestions: number;
    maxQuestionLength: number;
  };
};

export type ResearchExecutor = (input: ResearchExecutionInput) => Promise<ResearchExecutionResult>;

export type ResearchJobDependencies = {
  researchRunRepository: ResearchRunRepository;

  runResearch: ResearchExecutor;

  now?: () => Date;

  createExecutionToken?: () => string;

  leaseSafetyBufferMs?: number;
};

export type ResearchJobResult =
  | {
      kind: 'completed';

      researchRunId: string;

      outcome: Exclude<ResearchOutcome, 'failed'>;

      stopReason: Exclude<ResearchStopReason, 'terminal-failure'>;

      modelCalls: number;
      toolCalls: number;
    }
  | {
      kind: 'already-claimed';

      researchRunId: string;

      status: 'RUNNING' | 'COMPLETED' | 'FAILED';
    };

export async function processResearchJob(
  payload: ResearchJobPayload,
  dependencies: ResearchJobDependencies,
): Promise<ResearchJobResult> {
  const validatedPayload = researchJobSchema.parse(payload);

  const now = dependencies.now ?? (() => new Date());

  const createExecutionToken = dependencies.createExecutionToken ?? (() => crypto.randomUUID());

  const leaseSafetyBufferMs = dependencies.leaseSafetyBufferMs ?? DEFAULT_LEASE_SAFETY_BUFFER_MS;

  const persisted = await dependencies.researchRunRepository.findById(
    validatedPayload.researchRunId,
  );

  if (persisted === null) {
    throw new Error(`Cannot process missing research run: ${validatedPayload.researchRunId}`);
  }

  const claimedAt = now();

  const executionToken = createExecutionToken();

  if (executionToken.trim().length === 0 || executionToken !== executionToken.trim()) {
    throw new Error('Research execution token must be non-empty and normalized.');
  }

  if (!Number.isInteger(leaseSafetyBufferMs) || leaseSafetyBufferMs < 0) {
    throw new Error('Research lease safety buffer must be a nonnegative integer.');
  }

  const leaseExpiresAt = new Date(
    claimedAt.getTime() + persisted.budget.timeoutMs + leaseSafetyBufferMs,
  );

  const claim = await dependencies.researchRunRepository.claim({
    researchRunId: validatedPayload.researchRunId,

    executionToken,

    claimedAt,

    leaseExpiresAt,
  });

  if (!claim.claimed) {
    if (claim.run.status === 'PENDING') {
      throw new Error(
        [
          'Unclaimed research run unexpectedly remained PENDING.',
          `researchRunId=${claim.run.id}`,
        ].join(' '),
      );
    }

    return {
      kind: 'already-claimed',

      researchRunId: claim.run.id,

      status: claim.run.status,
    };
  }

  try {
    const execution = await dependencies.runResearch({
      researchRunId: claim.run.id,

      storyId: claim.run.storyId,

      researchGoal: claim.run.researchGoal,

      budget: claim.run.budget,
    });

    assertExecutionResult(execution);

    await dependencies.researchRunRepository.complete({
      researchRunId: claim.run.id,

      executionToken,

      outcome: execution.outcome,

      stopReason: execution.stopReason,

      selection: execution.selection,

      modelCalls: execution.modelCalls,

      toolCalls: execution.toolCalls,

      completedAt: now(),
    });

    return {
      kind: 'completed',

      researchRunId: claim.run.id,

      outcome: execution.outcome,

      stopReason: execution.stopReason,

      modelCalls: execution.modelCalls,

      toolCalls: execution.toolCalls,
    };
  } catch (error) {
    await dependencies.researchRunRepository.fail({
      researchRunId: claim.run.id,

      executionToken,

      modelCalls: 0,

      toolCalls: 0,

      completedAt: now(),
    });

    throw error;
  }
}

function assertExecutionResult(result: ResearchExecutionResult): void {
  if (!Number.isInteger(result.modelCalls) || result.modelCalls < 0) {
    throw new Error('Research executor returned invalid modelCalls.');
  }

  if (!Number.isInteger(result.toolCalls) || result.toolCalls < 0) {
    throw new Error('Research executor returned invalid toolCalls.');
  }
}
