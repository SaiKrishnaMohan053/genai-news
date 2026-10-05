import { randomUUID } from 'node:crypto';

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import {
  createResearchRunRepository,
  createStoryRepository,
  ResearchPersistenceConflictError,
  type DatabaseClient,
  type PersistedResearchRun,
} from '@genai-news/database';
import {
  createResearchJobId,
  enqueueResearch,
  RESEARCH_JOB_NAME,
  type ResearchQueue,
} from '@genai-news/queue';
import { researchBudgetSchema } from '@genai-news/shared';

import { AppError } from '../errors/app-error.js';

const researchStoryParamsSchema = z.strictObject({
  storyId: z.string().trim().min(1),
});

const researchRequestSchema = z.strictObject({
  researchGoal: z.string().trim().min(1).optional(),

  budget: researchBudgetSchema,
});

const researchRunParamsSchema = z.strictObject({
  researchRunId: z.string().trim().min(1),
});

const idempotencyKeySchema = z.string().trim().min(1).max(200);

export interface ResearchRouteOptions {
  database?: DatabaseClient;
  queue?: ResearchQueue;

  now?: () => Date;
  createResearchRunId?: () => string;
}

export const researchRoutes: FastifyPluginAsync<ResearchRouteOptions> = async (app, options) => {
  app.post('/api/news/stories/:storyId/research', async (request, reply) => {
    if (!options.database) {
      throw new AppError('Research storage is unavailable', 503, 'RESEARCH_STORAGE_UNAVAILABLE');
    }

    if (!options.queue) {
      throw new AppError('Research queue is unavailable', 503, 'RESEARCH_QUEUE_UNAVAILABLE');
    }

    const parsedParams = researchStoryParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      throw new AppError('Invalid research request', 400, 'INVALID_RESEARCH_REQUEST');
    }

    const parsedBody = researchRequestSchema.safeParse(request.body);

    if (!parsedBody.success) {
      throw new AppError('Invalid research request', 400, 'INVALID_RESEARCH_REQUEST');
    }

    const parsedIdempotencyKey = idempotencyKeySchema.safeParse(request.headers['idempotency-key']);

    if (!parsedIdempotencyKey.success) {
      throw new AppError('Idempotency-Key header is required', 400, 'INVALID_IDEMPOTENCY_KEY');
    }

    const storyRepository = createStoryRepository(options.database);

    const story = await storyRepository.findDetailById(parsedParams.data.storyId);

    if (story === null) {
      throw new AppError('Story not found', 404, 'STORY_NOT_FOUND');
    }

    const researchRepository = createResearchRunRepository(options.database);

    const existing = await researchRepository.findByIdempotencyKey(parsedIdempotencyKey.data);

    const createResearchRunId = options.createResearchRunId ?? randomUUID;

    const researchRunId = existing?.id ?? createResearchRunId();

    let persisted: {
      run: PersistedResearchRun;
      created: boolean;
    };

    try {
      persisted = await researchRepository.createPending({
        researchRunId,

        storyId: parsedParams.data.storyId,

        idempotencyKey: parsedIdempotencyKey.data,

        ...(parsedBody.data.researchGoal
          ? {
              researchGoal: parsedBody.data.researchGoal,
            }
          : {}),

        budget: parsedBody.data.budget,
      });
    } catch (error) {
      if (error instanceof ResearchPersistenceConflictError) {
        throw new AppError(
          'Research request conflicts with an existing idempotency key',
          409,
          'RESEARCH_IDEMPOTENCY_CONFLICT',
        );
      }

      throw error;
    }

    const now = options.now ?? (() => new Date());

    if (persisted.run.status === 'PENDING') {
      await enqueueResearch(options.queue, {
        researchRunId: persisted.run.id,
        requestedAt: now().toISOString(),
      });
    }

    return reply.status(202).send({
      status: 'accepted',

      researchRun: serializeResearchRun(persisted.run),

      job: {
        id: createResearchJobId(persisted.run.id),
        name: RESEARCH_JOB_NAME,
      },

      replayed: !persisted.created,
    });
  });

  app.get('/api/research/runs/:researchRunId', async (request) => {
    if (!options.database) {
      throw new AppError('Research storage is unavailable', 503, 'RESEARCH_STORAGE_UNAVAILABLE');
    }

    const parsedParams = researchRunParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      throw new AppError('Invalid research run request', 400, 'INVALID_RESEARCH_RUN_REQUEST');
    }

    const repository = createResearchRunRepository(options.database);

    const run = await repository.findById(parsedParams.data.researchRunId);

    if (run === null) {
      throw new AppError('Research run not found', 404, 'RESEARCH_RUN_NOT_FOUND');
    }

    return {
      researchRun: serializeResearchRun(run),
    };
  });

  app.get('/api/news/stories/:storyId/research', async (request) => {
    if (!options.database) {
      throw new AppError('Research storage is unavailable', 503, 'RESEARCH_STORAGE_UNAVAILABLE');
    }

    const parsedParams = researchStoryParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      throw new AppError('Invalid research request', 400, 'INVALID_RESEARCH_REQUEST');
    }

    const storyRepository = createStoryRepository(options.database);

    const story = await storyRepository.findDetailById(parsedParams.data.storyId);

    if (story === null) {
      throw new AppError('Story not found', 404, 'STORY_NOT_FOUND');
    }

    const researchRepository = createResearchRunRepository(options.database);

    const run = await researchRepository.findLatestByStoryId(parsedParams.data.storyId);

    if (run === null) {
      throw new AppError(
        'Research has not been started for this story',
        404,
        'STORY_RESEARCH_NOT_FOUND',
      );
    }

    return {
      researchRun: serializeResearchRun(run),
    };
  });
};

function serializeResearchRun(run: PersistedResearchRun) {
  return {
    id: run.id,

    storyId: run.storyId,

    status: run.status,

    researchGoal: run.researchGoal,

    budget: run.budget,

    outcome: run.outcome,

    stopReason: run.stopReason,

    selection: run.selection,

    modelCalls: run.modelCalls,

    toolCalls: run.toolCalls,

    startedAt: run.startedAt?.toISOString() ?? null,

    completedAt: run.completedAt?.toISOString() ?? null,

    createdAt: run.createdAt.toISOString(),

    updatedAt: run.updatedAt.toISOString(),
  };
}
