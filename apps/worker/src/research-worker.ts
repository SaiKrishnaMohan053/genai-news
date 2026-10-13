import type { ResearchRunRepository } from '@genai-news/database';

import { runWithSpan, type ResearchMetrics } from '@genai-news/observability';

import { RESEARCH_JOB_NAME, RESEARCH_QUEUE_NAME, type WorkerRedisClient } from '@genai-news/queue';

import type { ResearchJobPayload } from '@genai-news/schemas';

import { DelayedError, type Job, Worker } from 'bullmq';

import {
  processResearchJob,
  ResearchExecutionFailedError,
  type ResearchExecutor,
  type ResearchJobResult,
} from './jobs/research.js';

const LEASE_RETRY_FALLBACK_MS = 1_000;
const LEASE_RETRY_GRACE_MS = 1_000;

export type CreateResearchWorkerOptions = {
  connection: WorkerRedisClient;

  researchRunRepository: ResearchRunRepository;

  runResearch: ResearchExecutor;

  metrics?: ResearchMetrics;

  now?: () => Date;

  createExecutionToken?: () => string;

  leaseSafetyBufferMs?: number;
};

export type ResearchWorkerJob = Pick<
  Job<ResearchJobPayload, ResearchJobResult>,
  'name' | 'data' | 'id' | 'moveToDelayed'
>;

export async function processResearchWorkerJob(
  job: ResearchWorkerJob,
  token: string | undefined,
  options: Omit<CreateResearchWorkerOptions, 'connection'>,
): Promise<ResearchJobResult> {
  if (job.name !== RESEARCH_JOB_NAME) {
    throw new Error(`Unsupported job name: ${job.name}`);
  }

  const executionStartedAt = performance.now();

  try {
    return await runWithSpan(
      {
        tracerName: 'genai-news-worker',

        spanName: `job ${job.name}`,

        attributes: {
          'messaging.system': 'bullmq',

          'messaging.destination.name': RESEARCH_QUEUE_NAME,

          'messaging.operation.name': 'process',

          'job.name': job.name,

          'research.run.id': job.data.researchRunId,

          ...(job.id
            ? {
                'job.id': job.id,
              }
            : {}),
        },
      },

      async (span) => {
        const result = await processResearchJob(job.data, {
          researchRunRepository: options.researchRunRepository,

          runResearch: options.runResearch,

          ...(options.metrics === undefined
            ? {}
            : {
                metrics: options.metrics,
              }),

          ...(options.now === undefined
            ? {}
            : {
                now: options.now,
              }),

          ...(options.createExecutionToken === undefined
            ? {}
            : {
                createExecutionToken: options.createExecutionToken,
              }),

          ...(options.leaseSafetyBufferMs === undefined
            ? {}
            : {
                leaseSafetyBufferMs: options.leaseSafetyBufferMs,
              }),
        });

        span.setAttribute('research.job.result_kind', result.kind);

        if (result.kind === 'completed') {
          span.setAttribute('research.outcome', result.outcome);
          span.setAttribute('research.stop_reason', result.stopReason);
          span.setAttribute('research.model_calls', result.modelCalls);
          span.setAttribute('research.tool_calls', result.toolCalls);
          span.setAttribute('research.selected_source_count', result.selectedSourceCount);
          span.setAttribute('research.unresolved_question_count', result.unresolvedQuestionCount);

          options.metrics?.executionsTotal.inc({
            outcome: result.outcome,
            stop_reason: result.stopReason,
          });

          options.metrics?.modelCallsTotal.inc(result.modelCalls);
          options.metrics?.toolCallsTotal.inc(result.toolCalls);

          options.metrics?.executionDurationSeconds.observe(
            {
              outcome: result.outcome,
            },
            (performance.now() - executionStartedAt) / 1000,
          );

          return result;
        }

        span.setAttribute('research.persisted_status', result.status);

        if (result.status !== 'RUNNING') {
          return result;
        }

        const persisted = await options.researchRunRepository.findById(result.researchRunId);

        if (persisted === null) {
          throw new Error(
            `Research run disappeared while resolving lease contention: ${result.researchRunId}`,
          );
        }

        const currentTime = (options.now ?? (() => new Date()))();

        const retryAt = Math.max(
          currentTime.getTime() + LEASE_RETRY_FALLBACK_MS,
          (persisted.leaseExpiresAt?.getTime() ?? currentTime.getTime()) + LEASE_RETRY_GRACE_MS,
        );

        span.setAttribute('research.lease_retry_at', new Date(retryAt).toISOString());

        await job.moveToDelayed(retryAt, token);

        throw new DelayedError();
      },
    );
  } catch (error) {
    if (error instanceof ResearchExecutionFailedError) {
      options.metrics?.executionsTotal.inc({
        outcome: 'failed',
        stop_reason: 'terminal-failure',
      });

      options.metrics?.executionDurationSeconds.observe(
        {
          outcome: 'failed',
        },
        (performance.now() - executionStartedAt) / 1000,
      );
    }

    throw error;
  }
}

export function createResearchWorker(options: CreateResearchWorkerOptions) {
  return new Worker<ResearchJobPayload, ResearchJobResult>(
    RESEARCH_QUEUE_NAME,

    async (
      job: Job<ResearchJobPayload, ResearchJobResult>,
      token?: string,
    ): Promise<ResearchJobResult> =>
      processResearchWorkerJob(job, token, {
        researchRunRepository: options.researchRunRepository,

        runResearch: options.runResearch,

        ...(options.metrics === undefined
          ? {}
          : {
              metrics: options.metrics,
            }),

        ...(options.now === undefined
          ? {}
          : {
              now: options.now,
            }),

        ...(options.createExecutionToken === undefined
          ? {}
          : {
              createExecutionToken: options.createExecutionToken,
            }),

        ...(options.leaseSafetyBufferMs === undefined
          ? {}
          : {
              leaseSafetyBufferMs: options.leaseSafetyBufferMs,
            }),
      }),

    {
      connection: options.connection,

      concurrency: 1,
    },
  );
}
