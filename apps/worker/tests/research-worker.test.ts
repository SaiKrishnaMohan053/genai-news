import type { PersistedResearchRun, ResearchRunRepository } from '@genai-news/database';

import { RESEARCH_JOB_NAME, RESEARCH_QUEUE_NAME } from '@genai-news/queue';

import type { ResearchBudget } from '@genai-news/shared';

import { DelayedError } from 'bullmq';

import { describe, expect, it, vi } from 'vitest';

import type { ResearchExecutor } from '../src/jobs/research.js';

import { processResearchWorkerJob, type ResearchWorkerJob } from '../src/research-worker.js';

const budget: ResearchBudget = {
  maxToolCalls: 6,
  maxModelCalls: 4,
  timeoutMs: 30_000,
  maxSelectedSources: 5,
  maxUnresolvedQuestions: 3,
  maxQuestionLength: 300,
};

function createRun(
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' = 'PENDING',
): PersistedResearchRun {
  return {
    id: 'research-run-1',

    storyId: 'story-1',

    idempotencyKey: 'research:story-1:1',

    status,

    researchGoal: null,

    budget,

    outcome: status === 'COMPLETED' ? 'COMPLETE' : status === 'FAILED' ? 'FAILED' : null,

    stopReason:
      status === 'COMPLETED'
        ? 'CRITERIA_SATISFIED'
        : status === 'FAILED'
          ? 'TERMINAL_FAILURE'
          : null,

    selection: null,

    modelCalls: 0,
    toolCalls: 0,

    executionToken: status === 'RUNNING' ? 'active-token' : null,

    leaseExpiresAt: status === 'RUNNING' ? new Date('2026-09-29T18:01:00.000Z') : null,

    startedAt: status === 'PENDING' ? null : new Date('2026-09-29T18:00:00.000Z'),

    completedAt:
      status === 'COMPLETED' || status === 'FAILED' ? new Date('2026-09-29T18:00:30.000Z') : null,

    createdAt: new Date('2026-09-29T17:59:00.000Z'),

    updatedAt: new Date('2026-09-29T18:00:00.000Z'),
  };
}

function createRepository(
  options: {
    claimed?: boolean;
    status?: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  } = {},
): ResearchRunRepository {
  const claimed = options.claimed ?? true;

  const status = options.status ?? (claimed ? 'RUNNING' : 'COMPLETED');

  const run = createRun(status);

  return {
    createPending: vi.fn(),

    claim: vi.fn(async (input) => ({
      run: claimed
        ? {
            ...run,

            status: 'RUNNING',

            executionToken: input.executionToken,

            leaseExpiresAt: input.leaseExpiresAt,

            startedAt: run.startedAt ?? input.claimedAt,
          }
        : run,

      claimed,
    })),

    complete: vi.fn(async (input) => ({
      run: {
        ...run,

        status: 'COMPLETED',

        outcome: 'COMPLETE',

        stopReason: 'CRITERIA_SATISFIED',

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
}

function createJob(overrides: Partial<ResearchWorkerJob> = {}): ResearchWorkerJob {
  return {
    name: RESEARCH_JOB_NAME,

    id: 'research_research-run-1',

    data: {
      researchRunId: 'research-run-1',

      requestedAt: '2026-09-29T17:59:00.000Z',
    },

    moveToDelayed: vi.fn(async () => undefined),

    ...overrides,
  };
}

describe('research BullMQ worker processor', () => {
  it('rejects unsupported job names before processing', async () => {
    const repository = createRepository();

    const runResearch: ResearchExecutor = vi.fn();

    await expect(
      processResearchWorkerJob(
        createJob({
          name: 'unexpected-job',
        }),
        'bullmq-token',
        {
          researchRunRepository: repository,

          runResearch,
        },
      ),
    ).rejects.toThrow('Unsupported job name: unexpected-job');

    expect(repository.claim).not.toHaveBeenCalled();

    expect(runResearch).not.toHaveBeenCalled();
  });

  it('processes a claimed research run to completion', async () => {
    const repository = createRepository();

    const runResearch: ResearchExecutor = vi.fn(async () => ({
      outcome: 'complete',

      stopReason: 'criteria-satisfied',

      selection: null,

      modelCalls: 2,

      toolCalls: 3,
    }));

    const times = [new Date('2026-09-29T18:00:00.000Z'), new Date('2026-09-29T18:00:30.000Z')];

    const job = createJob();

    const result = await processResearchWorkerJob(job, 'bullmq-token', {
      researchRunRepository: repository,

      runResearch,

      createExecutionToken: () => 'execution-token',

      leaseSafetyBufferMs: 30_000,

      now: () => {
        const next = times.shift();

        if (!next) {
          throw new Error('Unexpected now() call');
        }

        return next;
      },
    });

    expect(result).toEqual({
      kind: 'completed',

      researchRunId: 'research-run-1',

      outcome: 'complete',

      stopReason: 'criteria-satisfied',

      modelCalls: 2,

      toolCalls: 3,
    });

    expect(job.moveToDelayed).not.toHaveBeenCalled();
  });

  it('treats already completed persisted state as a safe no-op', async () => {
    const repository = createRepository({
      claimed: false,

      status: 'COMPLETED',
    });

    const runResearch: ResearchExecutor = vi.fn();

    const job = createJob();

    const result = await processResearchWorkerJob(job, 'bullmq-token', {
      researchRunRepository: repository,

      runResearch,

      now: () => new Date('2026-09-29T18:00:00.000Z'),
    });

    expect(result).toEqual({
      kind: 'already-claimed',

      researchRunId: 'research-run-1',

      status: 'COMPLETED',
    });

    expect(runResearch).not.toHaveBeenCalled();

    expect(job.moveToDelayed).not.toHaveBeenCalled();
  });

  it('delays active RUNNING lease contention without consuming a normal retry', async () => {
    const repository = createRepository({
      claimed: false,

      status: 'RUNNING',
    });

    const runResearch: ResearchExecutor = vi.fn();

    const job = createJob();

    const promise = processResearchWorkerJob(job, 'bullmq-token', {
      researchRunRepository: repository,

      runResearch,

      now: () => new Date('2026-09-29T18:00:00.000Z'),
    });

    await expect(promise).rejects.toBeInstanceOf(DelayedError);

    expect(runResearch).not.toHaveBeenCalled();

    expect(job.moveToDelayed).toHaveBeenCalledWith(
      new Date('2026-09-29T18:01:01.000Z').getTime(),

      'bullmq-token',
    );

    expect(repository.findById).toHaveBeenCalledTimes(2);
  });

  it('uses a short fallback delay when a RUNNING lease has no expiry', async () => {
    const repository = createRepository({
      claimed: false,

      status: 'RUNNING',
    });

    const findById = vi.mocked(repository.findById);

    findById.mockResolvedValueOnce(createRun('RUNNING')).mockResolvedValueOnce({
      ...createRun('RUNNING'),

      leaseExpiresAt: null,
    });

    const runResearch: ResearchExecutor = vi.fn();

    const job = createJob();

    const promise = processResearchWorkerJob(job, 'bullmq-token', {
      researchRunRepository: repository,

      runResearch,

      now: () => new Date('2026-09-29T18:00:00.000Z'),
    });

    await expect(promise).rejects.toBeInstanceOf(DelayedError);

    expect(job.moveToDelayed).toHaveBeenCalledWith(
      new Date('2026-09-29T18:00:01.000Z').getTime(),

      'bullmq-token',
    );
  });

  it('uses the research queue contract names', () => {
    expect(RESEARCH_QUEUE_NAME).toBe('research');

    expect(RESEARCH_JOB_NAME).toBe('research.execute');
  });
});
