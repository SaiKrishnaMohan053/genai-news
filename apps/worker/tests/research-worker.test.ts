import type { PersistedResearchRun, ResearchRunRepository } from '@genai-news/database';

import { createMetricsRegistry, createResearchMetrics } from '@genai-news/observability';

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

    const metricsRegistry = createMetricsRegistry({
      service: 'worker',
      environment: 'test',
      collectDefaults: false,
    });

    const metrics = createResearchMetrics(metricsRegistry);

    const result = await processResearchWorkerJob(job, 'bullmq-token', {
      researchRunRepository: repository,

      runResearch,

      metrics,

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

      selectedSourceCount: 0,

      unresolvedQuestionCount: 0,
    });

    const metricsOutput = await metricsRegistry.metrics();

    expect(metricsOutput).toContain('genai_news_research_executions_total');
    expect(metricsOutput).toContain('outcome="complete"');
    expect(metricsOutput).toContain('stop_reason="criteria-satisfied"');

    expect(metricsOutput).toContain('genai_news_research_model_calls_total');
    expect(metricsOutput).toMatch(/genai_news_research_model_calls_total\{[^}]*\} 2/);

    expect(metricsOutput).toContain('genai_news_research_tool_calls_total');
    expect(metricsOutput).toMatch(/genai_news_research_tool_calls_total\{[^}]*\} 3/);

    expect(metricsOutput).toContain('genai_news_research_execution_duration_seconds_count');
    expect(metricsOutput).toMatch(
      /genai_news_research_execution_duration_seconds_count\{[^}]*outcome="complete"[^}]*\} 1/,
    );

    expect(metricsOutput).not.toContain('research-run-1');
    expect(metricsOutput).not.toContain('story-1');

    expect(job.moveToDelayed).not.toHaveBeenCalled();
  });

  it('does not count a missing persisted run as a failed research execution', async () => {
    const repository = createRepository();

    repository.findById = vi.fn(async () => null);

    const runResearch: ResearchExecutor = vi.fn();

    const metricsRegistry = createMetricsRegistry({
      service: 'worker',
      environment: 'test',
      collectDefaults: false,
    });

    const metrics = createResearchMetrics(metricsRegistry);

    await expect(
      processResearchWorkerJob(createJob(), 'bullmq-token', {
        researchRunRepository: repository,

        runResearch,

        metrics,
      }),
    ).rejects.toThrow('Cannot process missing research run');

    expect(runResearch).not.toHaveBeenCalled();

    const metricsOutput = await metricsRegistry.metrics();

    expect(metricsOutput).not.toContain('outcome="failed",stop_reason="terminal-failure"');
  });
  it('records terminal failure metrics for exceptional research execution', async () => {
    const repository = createRepository();

    const runResearch: ResearchExecutor = vi.fn(async () => {
      throw new Error('model provider unavailable');
    });

    const job = createJob();

    const metricsRegistry = createMetricsRegistry({
      service: 'worker',
      environment: 'test',
      collectDefaults: false,
    });

    const metrics = createResearchMetrics(metricsRegistry);

    const times = [new Date('2026-09-29T18:00:00.000Z'), new Date('2026-09-29T18:00:05.000Z')];

    const promise = processResearchWorkerJob(job, 'bullmq-token', {
      researchRunRepository: repository,

      runResearch,

      metrics,

      createExecutionToken: () => 'execution-token',

      now: () => {
        const next = times.shift();

        if (!next) {
          throw new Error('Unexpected now() call');
        }

        return next;
      },
    });

    await expect(promise).rejects.toThrow('model provider unavailable');

    expect(repository.fail).toHaveBeenCalledTimes(1);

    const metricsOutput = await metricsRegistry.metrics();

    expect(metricsOutput).toContain('genai_news_research_executions_total');
    expect(metricsOutput).toContain('outcome="failed"');
    expect(metricsOutput).toContain('stop_reason="terminal-failure"');

    expect(metricsOutput).toMatch(
      /genai_news_research_execution_duration_seconds_count\{[^}]*outcome="failed"[^}]*\} 1/,
    );

    expect(metricsOutput).not.toContain('research-run-1');
    expect(metricsOutput).not.toContain('story-1');

    expect(job.moveToDelayed).not.toHaveBeenCalled();
  });
  it('treats already completed persisted state as a safe no-op', async () => {
    const repository = createRepository({
      claimed: false,

      status: 'COMPLETED',
    });

    const runResearch: ResearchExecutor = vi.fn();

    const job = createJob();

    const metricsRegistry = createMetricsRegistry({
      service: 'worker',
      environment: 'test',
      collectDefaults: false,
    });

    const metrics = createResearchMetrics(metricsRegistry);

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

    const metricsRegistry = createMetricsRegistry({
      service: 'worker',
      environment: 'test',
      collectDefaults: false,
    });

    const metrics = createResearchMetrics(metricsRegistry);

    const promise = processResearchWorkerJob(job, 'bullmq-token', {
      researchRunRepository: repository,

      runResearch,

      metrics,

      now: () => new Date('2026-09-29T18:00:00.000Z'),
    });

    await expect(promise).rejects.toBeInstanceOf(DelayedError);

    expect(runResearch).not.toHaveBeenCalled();

    expect(job.moveToDelayed).toHaveBeenCalledWith(
      new Date('2026-09-29T18:01:01.000Z').getTime(),

      'bullmq-token',
    );

    expect(repository.findById).toHaveBeenCalledTimes(2);

    const metricsOutput = await metricsRegistry.metrics();

    expect(metricsOutput).not.toContain(
      'genai_news_research_executions_total{environment="test",outcome="failed"',
    );
    expect(metricsOutput).not.toContain('stop_reason="terminal-failure"');
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
