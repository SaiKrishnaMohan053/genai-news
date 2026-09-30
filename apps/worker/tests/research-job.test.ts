import type { PersistedResearchRun, ResearchRunRepository } from '@genai-news/database';

import type { ResearchBudget } from '@genai-news/shared';

import { describe, expect, it, vi } from 'vitest';

import { processResearchJob, type ResearchExecutor } from '../src/jobs/research.js';

const budget: ResearchBudget = {
  maxToolCalls: 6,
  maxModelCalls: 4,
  timeoutMs: 30_000,
  maxSelectedSources: 5,
  maxUnresolvedQuestions: 3,
  maxQuestionLength: 300,
};

function createRun(
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' = 'RUNNING',
): PersistedResearchRun {
  return {
    id: 'research-run-1',

    storyId: 'story-1',

    idempotencyKey: 'research:story-1:1',

    status,

    researchGoal: 'Find stronger source coverage.',

    budget,

    outcome: null,
    stopReason: null,
    selection: null,

    modelCalls: 0,
    toolCalls: 0,

    executionToken: status === 'RUNNING' ? 'existing-token' : null,

    leaseExpiresAt: status === 'RUNNING' ? new Date('2026-09-29T18:05:00.000Z') : null,

    startedAt: status === 'PENDING' ? null : new Date('2026-09-29T18:00:00.000Z'),

    completedAt: null,

    createdAt: new Date('2026-09-29T17:59:00.000Z'),

    updatedAt: new Date('2026-09-29T18:00:00.000Z'),
  };
}

function createRepository(
  options: {
    claimed?: boolean;

    status?: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  } = {},
) {
  const claimed = options.claimed ?? true;

  const status = options.status ?? (claimed ? 'RUNNING' : 'COMPLETED');

  const run = createRun(status);

  const repository: ResearchRunRepository = {
    createPending: vi.fn(),

    claim: vi.fn(async (input) => ({
      run: {
        ...run,

        status: 'RUNNING',

        executionToken: input.executionToken,

        leaseExpiresAt: input.leaseExpiresAt,

        startedAt: run.startedAt ?? input.claimedAt,
      },

      claimed,
    })),

    complete: vi.fn(async (input) => ({
      run: {
        ...run,

        status: 'COMPLETED',

        outcome:
          input.outcome === 'complete'
            ? 'COMPLETE'
            : input.outcome === 'partial'
              ? 'PARTIAL'
              : 'INSUFFICIENT_SOURCES',

        stopReason:
          input.stopReason === 'criteria-satisfied'
            ? 'CRITERIA_SATISFIED'
            : input.stopReason === 'no-useful-results'
              ? 'NO_USEFUL_RESULTS'
              : input.stopReason === 'tool-budget-exhausted'
                ? 'TOOL_BUDGET_EXHAUSTED'
                : input.stopReason === 'model-budget-exhausted'
                  ? 'MODEL_BUDGET_EXHAUSTED'
                  : 'DEADLINE_EXCEEDED',

        selection: input.selection,

        modelCalls: input.modelCalls,
        toolCalls: input.toolCalls,

        executionToken: null,
        leaseExpiresAt: null,

        completedAt: input.completedAt,
      },

      updated: true,
    })),

    fail: vi.fn(async (input) => ({
      run: {
        ...run,

        status: 'FAILED',

        outcome: 'FAILED',

        stopReason: 'TERMINAL_FAILURE',

        modelCalls: input.modelCalls,
        toolCalls: input.toolCalls,

        executionToken: null,
        leaseExpiresAt: null,

        completedAt: input.completedAt,
      },

      updated: true,
    })),

    findById: vi.fn(async () => run),
    findByIdempotencyKey: vi.fn(),
  };

  return repository;
}

describe('processResearchJob', () => {
  it('claims, executes, and completes a research run', async () => {
    const repository = createRepository();

    const runResearch: ResearchExecutor = vi.fn(async () => ({
      outcome: 'complete',
      stopReason: 'criteria-satisfied',

      selection: {
        sourceIds: ['source-1'],

        primarySourceCandidateIds: ['source-1'],

        unresolvedQuestions: [],

        completionSuggestion: 'coverage-sufficient',
      },

      modelCalls: 2,
      toolCalls: 3,
    }));

    const times = [new Date('2026-09-29T18:00:00.000Z'), new Date('2026-09-29T18:01:00.000Z')];

    const result = await processResearchJob(
      {
        researchRunId: 'research-run-1',

        requestedAt: '2026-09-29T17:59:00.000Z',
      },

      {
        researchRunRepository: repository,

        runResearch,

        createExecutionToken: () => 'execution-token-1',

        leaseSafetyBufferMs: 30_000,

        now: () => {
          const next = times.shift();

          if (!next) {
            throw new Error('Unexpected now() call');
          }

          return next;
        },
      },
    );

    expect(repository.findById).toHaveBeenCalledWith('research-run-1');

    expect(repository.claim).toHaveBeenCalledWith({
      researchRunId: 'research-run-1',

      executionToken: 'execution-token-1',

      claimedAt: new Date('2026-09-29T18:00:00.000Z'),

      leaseExpiresAt: new Date('2026-09-29T18:01:00.000Z'),
    });

    expect(runResearch).toHaveBeenCalledWith({
      researchRunId: 'research-run-1',

      storyId: 'story-1',

      researchGoal: 'Find stronger source coverage.',

      budget,
    });

    expect(repository.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        researchRunId: 'research-run-1',

        executionToken: 'execution-token-1',

        outcome: 'complete',

        stopReason: 'criteria-satisfied',

        modelCalls: 2,

        toolCalls: 3,

        completedAt: new Date('2026-09-29T18:01:00.000Z'),
      }),
    );

    expect(repository.fail).not.toHaveBeenCalled();

    expect(result).toEqual({
      kind: 'completed',

      researchRunId: 'research-run-1',

      outcome: 'complete',

      stopReason: 'criteria-satisfied',

      modelCalls: 2,

      toolCalls: 3,
    });
  });

  it('does not execute research when the run was already claimed', async () => {
    const repository = createRepository({
      claimed: false,
      status: 'RUNNING',
    });

    const runResearch: ResearchExecutor = vi.fn();

    const result = await processResearchJob(
      {
        researchRunId: 'research-run-1',

        requestedAt: '2026-09-29T17:59:00.000Z',
      },

      {
        researchRunRepository: repository,

        runResearch,

        createExecutionToken: () => 'execution-token-2',

        now: () => new Date('2026-09-29T18:00:00.000Z'),
      },
    );

    expect(runResearch).not.toHaveBeenCalled();

    expect(repository.complete).not.toHaveBeenCalled();

    expect(repository.fail).not.toHaveBeenCalled();

    expect(result).toEqual({
      kind: 'already-claimed',

      researchRunId: 'research-run-1',

      status: 'RUNNING',
    });
  });

  it('treats bounded partial research as a normal completion', async () => {
    const repository = createRepository();

    const runResearch: ResearchExecutor = vi.fn(async () => ({
      outcome: 'partial',

      stopReason: 'deadline-exceeded',

      selection: null,

      modelCalls: 3,
      toolCalls: 4,
    }));

    await processResearchJob(
      {
        researchRunId: 'research-run-1',

        requestedAt: '2026-09-29T17:59:00.000Z',
      },

      {
        researchRunRepository: repository,

        runResearch,

        createExecutionToken: () => 'execution-token-3',

        now: () => new Date('2026-09-29T18:00:00.000Z'),
      },
    );

    expect(repository.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        executionToken: 'execution-token-3',

        outcome: 'partial',

        stopReason: 'deadline-exceeded',

        modelCalls: 3,
        toolCalls: 4,
      }),
    );

    expect(repository.fail).not.toHaveBeenCalled();
  });

  it('persists terminal failure when execution throws', async () => {
    const repository = createRepository();

    const runResearch: ResearchExecutor = vi.fn(async () => {
      throw new Error('model provider unavailable');
    });

    const times = [new Date('2026-09-29T18:00:00.000Z'), new Date('2026-09-29T18:01:00.000Z')];

    await expect(
      processResearchJob(
        {
          researchRunId: 'research-run-1',

          requestedAt: '2026-09-29T17:59:00.000Z',
        },

        {
          researchRunRepository: repository,

          runResearch,

          createExecutionToken: () => 'execution-token-4',

          now: () => {
            const next = times.shift();

            if (!next) {
              throw new Error('Unexpected now() call');
            }

            return next;
          },
        },
      ),
    ).rejects.toThrow('model provider unavailable');

    expect(repository.fail).toHaveBeenCalledWith({
      researchRunId: 'research-run-1',

      executionToken: 'execution-token-4',

      modelCalls: 0,

      toolCalls: 0,

      completedAt: new Date('2026-09-29T18:01:00.000Z'),
    });

    expect(repository.complete).not.toHaveBeenCalled();
  });

  it('rejects an invalid queue payload before loading or claiming the run', async () => {
    const repository = createRepository();

    const runResearch: ResearchExecutor = vi.fn();

    await expect(
      processResearchJob(
        {
          researchRunId: '',

          requestedAt: 'not-a-date',
        },

        {
          researchRunRepository: repository,

          runResearch,
        },
      ),
    ).rejects.toThrow();

    expect(repository.findById).not.toHaveBeenCalled();

    expect(repository.claim).not.toHaveBeenCalled();

    expect(runResearch).not.toHaveBeenCalled();
  });

  it('derives the execution lease from the persisted timeout budget', async () => {
    const repository = createRepository();

    const runResearch: ResearchExecutor = vi.fn(async () => ({
      outcome: 'partial',

      stopReason: 'deadline-exceeded',

      selection: null,

      modelCalls: 1,

      toolCalls: 0,
    }));

    await processResearchJob(
      {
        researchRunId: 'research-run-1',

        requestedAt: '2026-09-29T17:59:00.000Z',
      },

      {
        researchRunRepository: repository,

        runResearch,

        createExecutionToken: () => 'lease-token',

        leaseSafetyBufferMs: 15_000,

        now: () => new Date('2026-09-29T18:00:00.000Z'),
      },
    );

    expect(repository.claim).toHaveBeenCalledWith(
      expect.objectContaining({
        executionToken: 'lease-token',

        claimedAt: new Date('2026-09-29T18:00:00.000Z'),

        leaseExpiresAt: new Date('2026-09-29T18:00:45.000Z'),
      }),
    );
  });
});
