import {
  researchAgentSelectionSchema,
  researchBudgetSchema,
  type ResearchAgentSelection,
  type ResearchBudget,
  type ResearchOutcome,
  type ResearchStopReason,
} from '@genai-news/shared';

import type { DatabaseClient } from '../client.js';

export type PersistedResearchRun = {
  id: string;

  storyId: string;

  idempotencyKey: string;

  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

  researchGoal: string | null;

  budget: ResearchBudget;

  outcome: 'COMPLETE' | 'PARTIAL' | 'INSUFFICIENT_SOURCES' | 'FAILED' | null;

  stopReason:
    | 'CRITERIA_SATISFIED'
    | 'NO_USEFUL_RESULTS'
    | 'TOOL_BUDGET_EXHAUSTED'
    | 'MODEL_BUDGET_EXHAUSTED'
    | 'DEADLINE_EXCEEDED'
    | 'TERMINAL_FAILURE'
    | null;

  selection: ResearchAgentSelection | null;

  modelCalls: number;
  toolCalls: number;

  executionToken: string | null;
  leaseExpiresAt: Date | null;

  startedAt: Date | null;
  completedAt: Date | null;

  createdAt: Date;

  updatedAt: Date;
};

export type CreatePendingResearchRunInput = {
  researchRunId: string;

  storyId: string;

  idempotencyKey: string;

  researchGoal?: string;

  budget: ResearchBudget;
};

export type CreatePendingResearchRunResult = {
  run: PersistedResearchRun;

  created: boolean;
};

export type ClaimResearchRunInput = {
  researchRunId: string;

  executionToken: string;

  claimedAt: Date;

  leaseExpiresAt: Date;
};

export type ClaimResearchRunResult = {
  run: PersistedResearchRun;

  claimed: boolean;
};

export type CompleteResearchRunInput = {
  researchRunId: string;

  outcome: Exclude<ResearchOutcome, 'failed'>;

  stopReason: Exclude<ResearchStopReason, 'terminal-failure'>;

  selection: ResearchAgentSelection | null;

  modelCalls: number;

  toolCalls: number;

  executionToken: string;

  completedAt: Date;
};

export type CompleteResearchRunResult = {
  run: PersistedResearchRun;

  updated: boolean;
};

export type FailResearchRunInput = {
  researchRunId: string;

  modelCalls: number;

  toolCalls: number;

  executionToken: string;

  completedAt: Date;
};

export type FailResearchRunResult = {
  run: PersistedResearchRun;

  updated: boolean;
};

export type ResearchRunRepository = {
  createPending(input: CreatePendingResearchRunInput): Promise<CreatePendingResearchRunResult>;

  claim(input: ClaimResearchRunInput): Promise<ClaimResearchRunResult>;

  complete(input: CompleteResearchRunInput): Promise<CompleteResearchRunResult>;

  fail(input: FailResearchRunInput): Promise<FailResearchRunResult>;

  findById(researchRunId: string): Promise<PersistedResearchRun | null>;

  findLatestByStoryId(storyId: string): Promise<PersistedResearchRun | null>;

  findByIdempotencyKey(idempotencyKey: string): Promise<PersistedResearchRun | null>;
};

export class ResearchPersistenceConflictError extends Error {
  constructor(message: string) {
    super(message);

    this.name = 'ResearchPersistenceConflictError';
  }
}

export function createResearchRunRepository(database: DatabaseClient): ResearchRunRepository {
  return {
    async createPending(input) {
      validateCreatePendingInput(input);

      const budget = researchBudgetSchema.parse(input.budget);

      const normalized = {
        ...input,

        budget,

        researchGoal: input.researchGoal ?? null,
      };

      try {
        return await database.$transaction(async (transaction) => {
          const story = await transaction.story.findUnique({
            where: {
              id: normalized.storyId,
            },

            select: {
              id: true,
            },
          });

          if (story === null) {
            throw new Error(`Cannot create research run for missing story: ${normalized.storyId}`);
          }

          const existingByKey = await transaction.researchRun.findUnique({
            where: {
              idempotencyKey: normalized.idempotencyKey,
            },
          });

          if (existingByKey !== null) {
            assertPendingReplayCompatible(existingByKey, normalized);

            return {
              run: mapResearchRun(existingByKey),

              created: false,
            };
          }

          const existingById = await transaction.researchRun.findUnique({
            where: {
              id: normalized.researchRunId,
            },
          });

          if (existingById !== null) {
            throw new ResearchPersistenceConflictError(
              [
                'Research run id already exists with a different idempotency key.',

                `researchRunId=${normalized.researchRunId}`,

                `existingIdempotencyKey=${existingById.idempotencyKey}`,

                `requestedIdempotencyKey=${normalized.idempotencyKey}`,
              ].join(' '),
            );
          }

          const created = await transaction.researchRun.create({
            data: {
              id: normalized.researchRunId,

              storyId: normalized.storyId,

              idempotencyKey: normalized.idempotencyKey,

              status: 'PENDING',

              researchGoal: normalized.researchGoal,

              budget: toJsonObject(normalized.budget),
            },
          });

          return {
            run: mapResearchRun(created),

            created: true,
          };
        });
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          throw error;
        }

        return recoverConcurrentCreate(database, normalized);
      }
    },

    async claim(input) {
      validateClaimInput(input);

      return database.$transaction(async (transaction) => {
        const before = await transaction.researchRun.findUnique({
          where: {
            id: input.researchRunId,
          },
        });

        if (before === null) {
          throw new Error(`Cannot claim missing research run: ${input.researchRunId}`);
        }

        const updated = await transaction.researchRun.updateMany({
          where: {
            id: input.researchRunId,

            OR: [
              {
                status: 'PENDING',
              },
              {
                status: 'RUNNING',
                leaseExpiresAt: {
                  lte: input.claimedAt,
                },
              },
            ],
          },

          data: {
            status: 'RUNNING',
            executionToken: input.executionToken,
            leaseExpiresAt: input.leaseExpiresAt,

            ...(before.startedAt === null
              ? {
                  startedAt: input.claimedAt,
                }
              : {}),
          },
        });

        const persisted = await transaction.researchRun.findUnique({
          where: {
            id: input.researchRunId,
          },
        });

        if (persisted === null) {
          throw new Error(`Cannot claim missing research run: ${input.researchRunId}`);
        }

        if (updated.count === 1) {
          return {
            run: mapResearchRun(persisted),
            claimed: true,
          };
        }

        if (
          persisted.status === 'RUNNING' ||
          persisted.status === 'COMPLETED' ||
          persisted.status === 'FAILED'
        ) {
          return {
            run: mapResearchRun(persisted),
            claimed: false,
          };
        }

        throw new ResearchPersistenceConflictError(
          [
            'Research run cannot be claimed.',
            `researchRunId=${input.researchRunId}`,
            `status=${persisted.status}`,
          ].join(' '),
        );
      });
    },

    async complete(input) {
      const validated = validateCompleteInput(input);

      /*

       * Only an actively RUNNING execution may establish

       * successful/partial terminal state.

       */

      const updated = await database.researchRun.updateMany({
        where: {
          id: validated.researchRunId,

          status: 'RUNNING',

          executionToken: validated.executionToken,
        },

        data: {
          status: 'COMPLETED',

          outcome: mapOutcomeForWrite(validated.outcome),

          stopReason: mapStopReasonForWrite(validated.stopReason),

          ...(validated.selection === null
            ? {}
            : {
                selection: toSelectionJson(validated.selection),
              }),

          modelCalls: validated.modelCalls,

          toolCalls: validated.toolCalls,

          executionToken: null,
          leaseExpiresAt: null,

          completedAt: validated.completedAt,
        },
      });

      const persisted = await database.researchRun.findUnique({
        where: {
          id: validated.researchRunId,
        },
      });

      if (persisted === null) {
        throw new Error(`Cannot complete missing research run: ${validated.researchRunId}`);
      }

      if (updated.count === 1) {
        return {
          run: mapResearchRun(persisted),

          updated: true,
        };
      }

      /*

       * Exact terminal replay is idempotent.

       *

       * BullMQ may retry after the database commit succeeded but

       * before the worker acknowledged completion.

       */

      if (persisted.status === 'RUNNING') {
        throw new ResearchPersistenceConflictError(
          [
            'Research completion rejected because the execution token is stale.',
            `researchRunId=${validated.researchRunId}`,
          ].join(' '),
        );
      }

      if (persisted.status === 'COMPLETED') {
        assertCompletionReplayCompatible(persisted, validated);

        return {
          run: mapResearchRun(persisted),

          updated: false,
        };
      }

      throw new ResearchPersistenceConflictError(
        [
          'Research run cannot transition to COMPLETED.',

          `researchRunId=${validated.researchRunId}`,

          `status=${persisted.status}`,
        ].join(' '),
      );
    },

    async fail(input) {
      validateFailInput(input);

      const updated = await database.researchRun.updateMany({
        where: {
          id: input.researchRunId,
          status: 'RUNNING',
          executionToken: input.executionToken,
        },

        data: {
          status: 'FAILED',
          outcome: 'FAILED',
          stopReason: 'TERMINAL_FAILURE',
          modelCalls: input.modelCalls,
          toolCalls: input.toolCalls,
          executionToken: null,
          leaseExpiresAt: null,
          completedAt: input.completedAt,
        },
      });

      const persisted = await database.researchRun.findUnique({
        where: {
          id: input.researchRunId,
        },
      });

      if (persisted === null) {
        throw new Error(`Cannot fail missing research run: ${input.researchRunId}`);
      }

      if (updated.count === 1) {
        return {
          run: mapResearchRun(persisted),
          updated: true,
        };
      }

      if (persisted.status === 'RUNNING') {
        throw new ResearchPersistenceConflictError(
          [
            'Research failure rejected because the execution token is stale.',
            `researchRunId=${input.researchRunId}`,
          ].join(' '),
        );
      }

      /*
       * Exact FAILED replay is also idempotent.
       */
      if (persisted.status === 'FAILED') {
        assertFailureReplayCompatible(persisted, input);

        return {
          run: mapResearchRun(persisted),
          updated: false,
        };
      }

      throw new ResearchPersistenceConflictError(
        [
          'Research run cannot transition to FAILED.',
          `researchRunId=${input.researchRunId}`,
          `status=${persisted.status}`,
        ].join(' '),
      );
    },

    async findById(researchRunId) {
      assertNonEmpty(researchRunId, 'Research run id');

      const run = await database.researchRun.findUnique({
        where: {
          id: researchRunId,
        },
      });

      return run === null ? null : mapResearchRun(run);
    },

    async findLatestByStoryId(storyId) {
      assertNonEmpty(storyId, 'Story id');

      const run = await database.researchRun.findFirst({
        where: {
          storyId,
        },

        orderBy: [
          {
            createdAt: 'desc',
          },
          {
            id: 'desc',
          },
        ],
      });

      return run === null ? null : mapResearchRun(run);
    },

    async findByIdempotencyKey(idempotencyKey) {
      assertNonEmpty(idempotencyKey, 'Idempotency key');

      const run = await database.researchRun.findUnique({
        where: {
          idempotencyKey,
        },
      });

      return run === null ? null : mapResearchRun(run);
    },
  };
}

function validateCreatePendingInput(input: CreatePendingResearchRunInput): void {
  assertNonEmpty(input.researchRunId, 'Research run id');

  assertNonEmpty(input.storyId, 'Story id');

  assertNonEmpty(input.idempotencyKey, 'Idempotency key');

  if (input.researchGoal !== undefined && input.researchGoal.trim().length === 0) {
    throw new Error('Research goal must be non-empty when provided.');
  }

  if (input.researchGoal !== undefined && input.researchGoal !== input.researchGoal.trim()) {
    throw new Error('Research goal must already be normalized.');
  }
}

function validateClaimInput(input: ClaimResearchRunInput): void {
  assertNonEmpty(input.researchRunId, 'Research run id');
  assertNonEmpty(input.executionToken, 'Execution token');

  assertValidDate(input.claimedAt, 'Research claimedAt');
  assertValidDate(input.leaseExpiresAt, 'Research leaseExpiresAt');

  if (input.leaseExpiresAt.getTime() <= input.claimedAt.getTime()) {
    throw new Error('Research execution lease must expire after it is claimed.');
  }
}

function validateCompleteInput(input: CompleteResearchRunInput): CompleteResearchRunInput {
  assertNonEmpty(input.researchRunId, 'Research run id');
  assertNonEmpty(input.executionToken, 'Execution token');

  assertCallCount(input.modelCalls, 'Model calls');

  assertCallCount(input.toolCalls, 'Tool calls');

  assertValidDate(input.completedAt, 'Research completedAt');

  const selection =
    input.selection === null ? null : researchAgentSelectionSchema.parse(input.selection);

  return {
    ...input,

    selection,
  };
}

function validateFailInput(input: FailResearchRunInput): void {
  assertNonEmpty(input.researchRunId, 'Research run id');
  assertNonEmpty(input.executionToken, 'Execution token');

  assertCallCount(input.modelCalls, 'Model calls');

  assertCallCount(input.toolCalls, 'Tool calls');

  assertValidDate(input.completedAt, 'Research completedAt');
}

function assertPendingReplayCompatible(
  run: {
    id: string;

    storyId: string;

    idempotencyKey: string;

    researchGoal: string | null;

    budget: unknown;
  },

  input: {
    researchRunId: string;

    storyId: string;

    idempotencyKey: string;

    researchGoal: string | null;

    budget: ResearchBudget;
  },
): void {
  const compatible =
    run.id === input.researchRunId &&
    run.storyId === input.storyId &&
    run.idempotencyKey === input.idempotencyKey &&
    run.researchGoal === input.researchGoal &&
    jsonValuesEqual(run.budget, input.budget);

  if (!compatible) {
    throw new ResearchPersistenceConflictError(
      [
        'Research idempotency key already exists with different request state.',

        `idempotencyKey=${input.idempotencyKey}`,
      ].join(' '),
    );
  }
}

function assertCompletionReplayCompatible(
  run: {
    outcome: string | null;

    stopReason: string | null;

    selection: unknown;

    modelCalls: number;

    toolCalls: number;
  },

  input: CompleteResearchRunInput,
): void {
  const compatible =
    run.outcome === mapOutcomeForWrite(input.outcome) &&
    run.stopReason === mapStopReasonForWrite(input.stopReason) &&
    run.modelCalls === input.modelCalls &&
    run.toolCalls === input.toolCalls &&
    jsonValuesEqual(run.selection, input.selection);

  if (!compatible) {
    throw new ResearchPersistenceConflictError(
      [
        'Research run already completed with different terminal state.',

        `researchRunId=${input.researchRunId}`,
      ].join(' '),
    );
  }
}

function assertFailureReplayCompatible(
  run: {
    outcome: string | null;

    stopReason: string | null;

    modelCalls: number;

    toolCalls: number;
  },

  input: FailResearchRunInput,
): void {
  const compatible =
    run.outcome === 'FAILED' &&
    run.stopReason === 'TERMINAL_FAILURE' &&
    run.modelCalls === input.modelCalls &&
    run.toolCalls === input.toolCalls;

  if (!compatible) {
    throw new ResearchPersistenceConflictError(
      [
        'Research run already failed with different terminal state.',

        `researchRunId=${input.researchRunId}`,
      ].join(' '),
    );
  }
}

async function recoverConcurrentCreate(
  database: DatabaseClient,

  input: {
    researchRunId: string;

    storyId: string;

    idempotencyKey: string;

    researchGoal: string | null;

    budget: ResearchBudget;
  },
): Promise<CreatePendingResearchRunResult> {
  const existing = await database.researchRun.findUnique({
    where: {
      idempotencyKey: input.idempotencyKey,
    },
  });

  if (existing !== null) {
    assertPendingReplayCompatible(existing, input);

    return {
      run: mapResearchRun(existing),

      created: false,
    };
  }

  const existingById = await database.researchRun.findUnique({
    where: {
      id: input.researchRunId,
    },
  });

  if (existingById !== null) {
    throw new ResearchPersistenceConflictError(
      [
        'Concurrent research persistence conflicted with existing research run id.',

        `researchRunId=${input.researchRunId}`,
      ].join(' '),
    );
  }

  throw new ResearchPersistenceConflictError(
    [
      'Concurrent research persistence conflict could not be reconciled.',

      `researchRunId=${input.researchRunId}`,

      `idempotencyKey=${input.idempotencyKey}`,
    ].join(' '),
  );
}

function mapResearchRun(run: {
  id: string;

  storyId: string;

  idempotencyKey: string;

  status: string;

  researchGoal: string | null;

  budget: unknown;

  outcome: string | null;

  stopReason: string | null;

  selection: unknown;

  modelCalls: number;

  toolCalls: number;

  executionToken: string | null;
  leaseExpiresAt: Date | null;

  startedAt: Date | null;

  completedAt: Date | null;

  createdAt: Date;

  updatedAt: Date;
}): PersistedResearchRun {
  const budget = researchBudgetSchema.parse(run.budget);

  if (
    run.status !== 'PENDING' &&
    run.status !== 'RUNNING' &&
    run.status !== 'COMPLETED' &&
    run.status !== 'FAILED'
  ) {
    throw new Error(`Unexpected research run status: ${run.status}`);
  }

  return {
    id: run.id,

    storyId: run.storyId,

    idempotencyKey: run.idempotencyKey,

    status: run.status,

    researchGoal: run.researchGoal,

    budget,

    outcome: mapOutcome(run.outcome),

    stopReason: mapStopReason(run.stopReason),

    selection: run.selection === null ? null : researchAgentSelectionSchema.parse(run.selection),

    modelCalls: run.modelCalls,

    toolCalls: run.toolCalls,

    executionToken: run.executionToken,
    leaseExpiresAt: run.leaseExpiresAt,

    startedAt: run.startedAt,

    completedAt: run.completedAt,

    createdAt: run.createdAt,

    updatedAt: run.updatedAt,
  };
}

function mapOutcome(value: string | null): PersistedResearchRun['outcome'] {
  if (value === null) {
    return null;
  }

  if (
    value !== 'COMPLETE' &&
    value !== 'PARTIAL' &&
    value !== 'INSUFFICIENT_SOURCES' &&
    value !== 'FAILED'
  ) {
    throw new Error(`Unexpected research outcome: ${value}`);
  }

  return value;
}

function mapStopReason(value: string | null): PersistedResearchRun['stopReason'] {
  if (value === null) {
    return null;
  }

  if (
    value !== 'CRITERIA_SATISFIED' &&
    value !== 'NO_USEFUL_RESULTS' &&
    value !== 'TOOL_BUDGET_EXHAUSTED' &&
    value !== 'MODEL_BUDGET_EXHAUSTED' &&
    value !== 'DEADLINE_EXCEEDED' &&
    value !== 'TERMINAL_FAILURE'
  ) {
    throw new Error(`Unexpected research stop reason: ${value}`);
  }

  return value;
}

function mapOutcomeForWrite(
  outcome: Exclude<ResearchOutcome, 'failed'>,
): 'COMPLETE' | 'PARTIAL' | 'INSUFFICIENT_SOURCES' {
  switch (outcome) {
    case 'complete':
      return 'COMPLETE';

    case 'partial':
      return 'PARTIAL';

    case 'insufficient-sources':
      return 'INSUFFICIENT_SOURCES';
  }
}

function mapStopReasonForWrite(
  stopReason: Exclude<ResearchStopReason, 'terminal-failure'>,
):
  | 'CRITERIA_SATISFIED'
  | 'NO_USEFUL_RESULTS'
  | 'TOOL_BUDGET_EXHAUSTED'
  | 'MODEL_BUDGET_EXHAUSTED'
  | 'DEADLINE_EXCEEDED' {
  switch (stopReason) {
    case 'criteria-satisfied':
      return 'CRITERIA_SATISFIED';

    case 'no-useful-results':
      return 'NO_USEFUL_RESULTS';

    case 'tool-budget-exhausted':
      return 'TOOL_BUDGET_EXHAUSTED';

    case 'model-budget-exhausted':
      return 'MODEL_BUDGET_EXHAUSTED';

    case 'deadline-exceeded':
      return 'DEADLINE_EXCEEDED';
  }
}

function toSelectionJson(selection: ResearchAgentSelection): {
  sourceIds: string[];

  primarySourceCandidateIds: string[];

  unresolvedQuestions: string[];

  completionSuggestion: 'coverage-sufficient' | 'coverage-incomplete';
} {
  return {
    sourceIds: [...selection.sourceIds],

    primarySourceCandidateIds: [...selection.primarySourceCandidateIds],

    unresolvedQuestions: [...selection.unresolvedQuestions],

    completionSuggestion: selection.completionSuggestion,
  };
}

function assertNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0 || value !== value.trim()) {
    throw new Error(`${label} must be non-empty and normalized.`);
  }
}

function assertCallCount(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative integer.`);
  }
}

function assertValidDate(value: Date, label: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${label} must be a valid date.`);
  }
}

function toJsonObject(value: ResearchBudget): Record<string, number> {
  return {
    maxToolCalls: value.maxToolCalls,

    maxModelCalls: value.maxModelCalls,

    timeoutMs: value.timeoutMs,

    maxSelectedSources: value.maxSelectedSources,

    maxUnresolvedQuestions: value.maxUnresolvedQuestions,

    maxQuestionLength: value.maxQuestionLength,
  };
}

function jsonValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(sortJsonValue(left)) === JSON.stringify(sortJsonValue(right));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)

        .sort(([left], [right]) => left.localeCompare(right))

        .map(([key, nested]) => [key, sortJsonValue(nested)]),
    );
  }

  return value;
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
