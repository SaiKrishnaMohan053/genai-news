import {
  createResearchRunRepository,
  createStoryRepository,
  ResearchPersistenceConflictError,
  type DatabaseClient,
  type PersistedResearchRun,
  type ResearchRunRepository,
} from '@genai-news/database';
import type { ResearchQueue } from '@genai-news/queue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';

vi.mock('@genai-news/database', async () => {
  const actual =
    await vi.importActual<typeof import('@genai-news/database')>('@genai-news/database');

  return {
    ...actual,
    createStoryRepository: vi.fn(),
    createResearchRunRepository: vi.fn(),
  };
});

const budget = {
  maxToolCalls: 8,
  maxModelCalls: 4,
  timeoutMs: 60_000,
  maxSelectedSources: 8,
  maxUnresolvedQuestions: 5,
  maxQuestionLength: 300,
};

function createPendingRun(overrides: Partial<PersistedResearchRun> = {}): PersistedResearchRun {
  return {
    id: 'research-run-1',
    storyId: 'story-1',
    idempotencyKey: 'research-request-1',
    status: 'PENDING',
    researchGoal: 'Verify the latest facts',
    budget,
    outcome: null,
    stopReason: null,
    selection: null,
    modelCalls: 0,
    toolCalls: 0,
    executionToken: null,
    leaseExpiresAt: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date('2026-10-05T18:00:00.000Z'),
    updatedAt: new Date('2026-10-05T18:00:00.000Z'),
    ...overrides,
  };
}

function createQueueMock(): ResearchQueue {
  return {
    add: vi.fn().mockResolvedValue({
      id: 'research_research-run-1',
      name: 'research.execute',
    }),
  } as unknown as ResearchQueue;
}

function createRepositoryMock(
  overrides: Partial<ResearchRunRepository> = {},
): ResearchRunRepository {
  return {
    createPending: vi.fn(),
    claim: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
    findById: vi.fn(),
    findLatestByStoryId: vi.fn(),
    findByIdempotencyKey: vi.fn(),
    ...overrides,
  };
}

describe('research route', () => {
  const database = {} as DatabaseClient;

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(createStoryRepository).mockReturnValue({
      findDetailById: vi.fn().mockResolvedValue({
        id: 'story-1',
      }),
    } as unknown as ReturnType<typeof createStoryRepository>);
  });

  it('creates a pending research run and enqueues execution', async () => {
    const queue = createQueueMock();

    const repository = createRepositoryMock({
      findByIdempotencyKey: vi.fn().mockResolvedValue(null),

      createPending: vi.fn().mockResolvedValue({
        run: createPendingRun(),
        created: true,
      }),
    });

    vi.mocked(createResearchRunRepository).mockReturnValue(repository);

    const app = buildApp({
      logger: false,
      database,
      researchQueue: queue,
      now: () => new Date('2026-10-05T18:01:00.000Z'),
      createResearchRunId: () => 'research-run-1',
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/news/stories/story-1/research',
        headers: {
          'idempotency-key': 'research-request-1',
        },
        payload: {
          researchGoal: 'Verify the latest facts',
          budget,
        },
      });

      expect(response.statusCode).toBe(202);

      expect(repository.createPending).toHaveBeenCalledWith({
        researchRunId: 'research-run-1',
        storyId: 'story-1',
        idempotencyKey: 'research-request-1',
        researchGoal: 'Verify the latest facts',
        budget,
      });

      expect(queue.add).toHaveBeenCalledOnce();

      expect(queue.add).toHaveBeenCalledWith(
        'research.execute',
        {
          researchRunId: 'research-run-1',
          requestedAt: '2026-10-05T18:01:00.000Z',
        },
        expect.objectContaining({
          jobId: 'research_research-run-1',
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1_000,
          },
        }),
      );

      expect(response.json()).toEqual({
        status: 'accepted',

        researchRun: {
          id: 'research-run-1',
          storyId: 'story-1',
          status: 'PENDING',
          researchGoal: 'Verify the latest facts',
          budget,
          outcome: null,
          stopReason: null,
          selection: null,
          modelCalls: 0,
          toolCalls: 0,
          startedAt: null,
          completedAt: null,
          createdAt: '2026-10-05T18:00:00.000Z',
          updatedAt: '2026-10-05T18:00:00.000Z',
        },

        job: {
          id: 'research_research-run-1',
          name: 'research.execute',
        },

        replayed: false,
      });
    } finally {
      await app.close();
    }
  });

  it('reuses the existing research run for an idempotent replay', async () => {
    const queue = createQueueMock();

    const existing = createPendingRun();

    const repository = createRepositoryMock({
      findByIdempotencyKey: vi.fn().mockResolvedValue(existing),

      createPending: vi.fn().mockResolvedValue({
        run: existing,
        created: false,
      }),
    });

    vi.mocked(createResearchRunRepository).mockReturnValue(repository);

    const createResearchRunId = vi.fn(() => 'should-not-be-used');

    const app = buildApp({
      logger: false,
      database,
      researchQueue: queue,
      now: () => new Date('2026-10-05T18:01:00.000Z'),
      createResearchRunId,
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/news/stories/story-1/research',
        headers: {
          'idempotency-key': 'research-request-1',
        },
        payload: {
          researchGoal: 'Verify the latest facts',
          budget,
        },
      });

      expect(response.statusCode).toBe(202);

      expect(createResearchRunId).not.toHaveBeenCalled();

      expect(repository.createPending).toHaveBeenCalledWith(
        expect.objectContaining({
          researchRunId: 'research-run-1',
          idempotencyKey: 'research-request-1',
        }),
      );

      expect(response.json()).toEqual(
        expect.objectContaining({
          replayed: true,
        }),
      );
    } finally {
      await app.close();
    }
  });

  it('rejects a request without an idempotency key', async () => {
    const queue = createQueueMock();

    const app = buildApp({
      logger: false,
      database,
      researchQueue: queue,
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/news/stories/story-1/research',
        payload: {
          budget,
        },
      });

      expect(response.statusCode).toBe(400);

      expect(response.json()).toEqual({
        error: {
          code: 'INVALID_IDEMPOTENCY_KEY',
          message: 'Idempotency-Key header is required',
        },
      });

      expect(queue.add).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('rejects an invalid research budget', async () => {
    const queue = createQueueMock();

    const app = buildApp({
      logger: false,
      database,
      researchQueue: queue,
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/news/stories/story-1/research',
        headers: {
          'idempotency-key': 'research-request-1',
        },
        payload: {
          budget: {
            ...budget,
            maxModelCalls: 0,
          },
        },
      });

      expect(response.statusCode).toBe(400);

      expect(response.json()).toEqual({
        error: {
          code: 'INVALID_RESEARCH_REQUEST',
          message: 'Invalid research request',
        },
      });

      expect(queue.add).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('returns 404 when the story does not exist', async () => {
    const queue = createQueueMock();

    vi.mocked(createStoryRepository).mockReturnValue({
      findDetailById: vi.fn().mockResolvedValue(null),
    } as unknown as ReturnType<typeof createStoryRepository>);

    const app = buildApp({
      logger: false,
      database,
      researchQueue: queue,
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/news/stories/missing-story/research',
        headers: {
          'idempotency-key': 'research-request-1',
        },
        payload: {
          budget,
        },
      });

      expect(response.statusCode).toBe(404);

      expect(response.json()).toEqual({
        error: {
          code: 'STORY_NOT_FOUND',
          message: 'Story not found',
        },
      });

      expect(queue.add).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('returns 409 for an incompatible idempotent replay', async () => {
    const queue = createQueueMock();

    const repository = createRepositoryMock({
      findByIdempotencyKey: vi.fn().mockResolvedValue(createPendingRun()),

      createPending: vi
        .fn()
        .mockRejectedValue(
          new ResearchPersistenceConflictError(
            'Research idempotency key already exists with different request state.',
          ),
        ),
    });

    vi.mocked(createResearchRunRepository).mockReturnValue(repository);

    const app = buildApp({
      logger: false,
      database,
      researchQueue: queue,
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/news/stories/story-1/research',
        headers: {
          'idempotency-key': 'research-request-1',
        },
        payload: {
          budget,
        },
      });

      expect(response.statusCode).toBe(409);

      expect(response.json()).toEqual({
        error: {
          code: 'RESEARCH_IDEMPOTENCY_CONFLICT',
          message: 'Research request conflicts with an existing idempotency key',
        },
      });

      expect(queue.add).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('returns 503 when research storage is unavailable', async () => {
    const app = buildApp({
      logger: false,
      researchQueue: createQueueMock(),
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/news/stories/story-1/research',
        headers: {
          'idempotency-key': 'research-request-1',
        },
        payload: {
          budget,
        },
      });

      expect(response.statusCode).toBe(503);

      expect(response.json()).toEqual({
        error: {
          code: 'RESEARCH_STORAGE_UNAVAILABLE',
          message: 'Research storage is unavailable',
        },
      });
    } finally {
      await app.close();
    }
  });

  it('returns 503 when the research queue is unavailable', async () => {
    const app = buildApp({
      logger: false,
      database,
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/news/stories/story-1/research',
        headers: {
          'idempotency-key': 'research-request-1',
        },
        payload: {
          budget,
        },
      });

      expect(response.statusCode).toBe(503);

      expect(response.json()).toEqual({
        error: {
          code: 'RESEARCH_QUEUE_UNAVAILABLE',
          message: 'Research queue is unavailable',
        },
      });
    } finally {
      await app.close();
    }
  });

  it('returns a persisted research run by id', async () => {
    const repository = createRepositoryMock({
      findById: vi.fn().mockResolvedValue(
        createPendingRun({
          status: 'COMPLETED',
          outcome: 'COMPLETE',
          stopReason: 'CRITERIA_SATISFIED',
          modelCalls: 2,
          toolCalls: 5,
          startedAt: new Date('2026-10-05T18:01:00.000Z'),
          completedAt: new Date('2026-10-05T18:02:00.000Z'),
        }),
      ),
    });

    vi.mocked(createResearchRunRepository).mockReturnValue(repository);

    const app = buildApp({
      logger: false,
      database,
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/research/runs/research-run-1',
      });

      expect(response.statusCode).toBe(200);

      expect(repository.findById).toHaveBeenCalledWith('research-run-1');

      expect(response.json()).toEqual({
        researchRun: expect.objectContaining({
          id: 'research-run-1',
          storyId: 'story-1',
          status: 'COMPLETED',
          outcome: 'COMPLETE',
          stopReason: 'CRITERIA_SATISFIED',
          modelCalls: 2,
          toolCalls: 5,
          startedAt: '2026-10-05T18:01:00.000Z',
          completedAt: '2026-10-05T18:02:00.000Z',
        }),
      });
    } finally {
      await app.close();
    }
  });

  it('returns 404 when a research run does not exist', async () => {
    const repository = createRepositoryMock({
      findById: vi.fn().mockResolvedValue(null),
    });

    vi.mocked(createResearchRunRepository).mockReturnValue(repository);

    const app = buildApp({
      logger: false,
      database,
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/research/runs/missing-run',
      });

      expect(response.statusCode).toBe(404);

      expect(response.json()).toEqual({
        error: {
          code: 'RESEARCH_RUN_NOT_FOUND',
          message: 'Research run not found',
        },
      });
    } finally {
      await app.close();
    }
  });

  it('returns 503 when research run storage is unavailable', async () => {
    const app = buildApp({
      logger: false,
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/research/runs/research-run-1',
      });

      expect(response.statusCode).toBe(503);

      expect(response.json()).toEqual({
        error: {
          code: 'RESEARCH_STORAGE_UNAVAILABLE',
          message: 'Research storage is unavailable',
        },
      });
    } finally {
      await app.close();
    }
  });
  it('returns the latest research run for a story', async () => {
    const repository = createRepositoryMock({
      findLatestByStoryId: vi.fn().mockResolvedValue(
        createPendingRun({
          status: 'COMPLETED',
          outcome: 'COMPLETE',
          stopReason: 'CRITERIA_SATISFIED',
        }),
      ),
    });

    vi.mocked(createResearchRunRepository).mockReturnValue(repository);

    const app = buildApp({
      logger: false,
      database,
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/news/stories/story-1/research',
      });

      expect(response.statusCode).toBe(200);

      expect(repository.findLatestByStoryId).toHaveBeenCalledWith('story-1');

      expect(response.json()).toEqual({
        researchRun: expect.objectContaining({
          id: 'research-run-1',
          storyId: 'story-1',
          status: 'COMPLETED',
          outcome: 'COMPLETE',
        }),
      });
    } finally {
      await app.close();
    }
  });

  it('returns 404 when a story has no research run', async () => {
    const repository = createRepositoryMock({
      findLatestByStoryId: vi.fn().mockResolvedValue(null),
    });

    vi.mocked(createResearchRunRepository).mockReturnValue(repository);

    const app = buildApp({
      logger: false,
      database,
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/news/stories/story-1/research',
      });

      expect(response.statusCode).toBe(404);

      expect(response.json()).toEqual({
        error: {
          code: 'STORY_RESEARCH_NOT_FOUND',
          message: 'Research has not been started for this story',
        },
      });
    } finally {
      await app.close();
    }
  });

  it('returns 404 when requesting research for a missing story', async () => {
    vi.mocked(createStoryRepository).mockReturnValue({
      findDetailById: vi.fn().mockResolvedValue(null),
    } as unknown as ReturnType<typeof createStoryRepository>);

    const repository = createRepositoryMock();

    vi.mocked(createResearchRunRepository).mockReturnValue(repository);

    const app = buildApp({
      logger: false,
      database,
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/news/stories/missing-story/research',
      });

      expect(response.statusCode).toBe(404);

      expect(response.json()).toEqual({
        error: {
          code: 'STORY_NOT_FOUND',
          message: 'Story not found',
        },
      });

      expect(repository.findLatestByStoryId).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it('leaves a pending run recoverable when enqueue fails', async () => {
    const queue = {
      add: vi.fn().mockRejectedValue(new Error('redis unavailable')),
    } as unknown as ResearchQueue;

    const pendingRun = createPendingRun();

    const repository = createRepositoryMock({
      findByIdempotencyKey: vi.fn().mockResolvedValue(null),

      createPending: vi.fn().mockResolvedValue({
        run: pendingRun,
        created: true,
      }),
    });

    vi.mocked(createResearchRunRepository).mockReturnValue(repository);

    const app = buildApp({
      logger: false,
      database,
      researchQueue: queue,
      now: () => new Date('2026-10-05T18:01:00.000Z'),
      createResearchRunId: () => 'research-run-1',
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/news/stories/story-1/research',
        headers: {
          'idempotency-key': 'research-request-1',
        },
        payload: {
          researchGoal: 'Verify the latest facts',
          budget,
        },
      });

      expect(response.statusCode).toBe(500);

      expect(repository.createPending).toHaveBeenCalledOnce();

      expect(queue.add).toHaveBeenCalledOnce();

      expect(pendingRun.status).toBe('PENDING');
    } finally {
      await app.close();
    }
  });

  it('retries enqueue for an existing pending idempotent run', async () => {
    const queue = createQueueMock();

    const pendingRun = createPendingRun();

    const repository = createRepositoryMock({
      findByIdempotencyKey: vi.fn().mockResolvedValue(pendingRun),

      createPending: vi.fn().mockResolvedValue({
        run: pendingRun,
        created: false,
      }),
    });

    vi.mocked(createResearchRunRepository).mockReturnValue(repository);

    const createResearchRunId = vi.fn(() => 'unused-run-id');

    const app = buildApp({
      logger: false,
      database,
      researchQueue: queue,
      now: () => new Date('2026-10-05T18:02:00.000Z'),
      createResearchRunId,
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/news/stories/story-1/research',
        headers: {
          'idempotency-key': 'research-request-1',
        },
        payload: {
          researchGoal: 'Verify the latest facts',
          budget,
        },
      });

      expect(response.statusCode).toBe(202);

      expect(createResearchRunId).not.toHaveBeenCalled();

      expect(queue.add).toHaveBeenCalledWith(
        'research.execute',
        {
          researchRunId: 'research-run-1',
          requestedAt: '2026-10-05T18:02:00.000Z',
        },
        expect.objectContaining({
          jobId: 'research_research-run-1',
        }),
      );

      expect(response.json()).toEqual(
        expect.objectContaining({
          replayed: true,
        }),
      );
    } finally {
      await app.close();
    }
  });
});
