import { describe, expect, it, vi } from 'vitest';

import { enqueueSystemPing, SYSTEM_PING_JOB_NAME, SYSTEM_QUEUE_NAME } from '../src/system-queue.js';

describe('system queue', () => {
  it('uses stable queue and job names', () => {
    expect(SYSTEM_QUEUE_NAME).toBe('system');

    expect(SYSTEM_PING_JOB_NAME).toBe('system.ping');
  });

  it('enqueues a valid payload', async () => {
    const add = vi.fn().mockResolvedValue({
      id: 'job-123',
    });

    const queue = {
      add,
    };

    const payload = {
      message: 'hello',
      requestedAt: '2026-08-21T15:00:00.000Z',
    };

    await enqueueSystemPing(queue as never, payload, 'job-123');

    expect(add).toHaveBeenCalledWith(SYSTEM_PING_JOB_NAME, payload, {
      jobId: 'job-123',
    });
  });

  it('rejects invalid payload before queue.add', async () => {
    const add = vi.fn();

    const queue = {
      add,
    };

    await expect(
      enqueueSystemPing(
        queue as never,
        {
          message: '',
          requestedAt: 'invalid',
        },
        'job-123',
      ),
    ).rejects.toThrow();

    expect(add).not.toHaveBeenCalled();
  });

  it('rejects invalid job id before queue.add', async () => {
    const add = vi.fn();

    const queue = {
      add,
    };

    await expect(
      enqueueSystemPing(
        queue as never,
        {
          message: 'hello',
          requestedAt: '2026-08-21T15:00:00.000Z',
        },
        'job:123',
      ),
    ).rejects.toThrow();

    expect(add).not.toHaveBeenCalled();
  });
});
