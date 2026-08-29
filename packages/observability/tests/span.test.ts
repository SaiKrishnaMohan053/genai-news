import { SpanStatusCode, trace } from '@opentelemetry/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runWithSpan } from '../src/span.js';

describe('runWithSpan', () => {
  const setAttributes = vi.fn();
  const setStatus = vi.fn();
  const recordException = vi.fn();
  const end = vi.fn();

  const span = {
    setAttributes,
    setStatus,
    recordException,
    end,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(trace, 'getTracer').mockReturnValue({
      startActiveSpan: vi.fn(
        async (_name: string, callback: (activeSpan: typeof span) => Promise<unknown>) =>
          callback(span),
      ),
    } as never);
  });

  it('returns the operation result', async () => {
    await expect(
      runWithSpan(
        {
          tracerName: 'test',
          spanName: 'operation',
        },
        async () => 'result',
      ),
    ).resolves.toBe('result');
  });

  it('sets attributes and OK status on success', async () => {
    await runWithSpan(
      {
        tracerName: 'test',
        spanName: 'operation',
        attributes: {
          'job.name': 'system.ping',
        },
      },
      async () => 'result',
    );

    expect(setAttributes).toHaveBeenCalledWith({
      'job.name': 'system.ping',
    });

    expect(setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.OK,
    });

    expect(end).toHaveBeenCalledOnce();
  });

  it('records errors and rethrows them', async () => {
    const error = new Error('boom');

    await expect(
      runWithSpan(
        {
          tracerName: 'test',
          spanName: 'operation',
        },
        async () => {
          throw error;
        },
      ),
    ).rejects.toThrow('boom');

    expect(recordException).toHaveBeenCalledWith(error);

    expect(setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: 'boom',
    });

    expect(end).toHaveBeenCalledOnce();
  });

  it('ends the span when a non-Error value is thrown', async () => {
    await expect(
      runWithSpan(
        {
          tracerName: 'test',
          spanName: 'operation',
        },
        async () => {
          throw 'failure';
        },
      ),
    ).rejects.toBe('failure');

    expect(recordException).not.toHaveBeenCalled();

    expect(setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: 'failure',
    });

    expect(end).toHaveBeenCalledOnce();
  });

  it('allows the operation to add runtime span attributes', async () => {
    const setAttribute = vi.fn();

    const spanWithAttribute = {
      ...span,
      setAttribute,
    };

    vi.spyOn(trace, 'getTracer').mockReturnValue({
      startActiveSpan: vi.fn(
        async (
          _name: string,
          callback: (
            activeSpan: typeof spanWithAttribute,
          ) => Promise<unknown>,
        ) => callback(spanWithAttribute),
      ),
    } as never);

    await runWithSpan(
      {
        tracerName: 'test',
        spanName: 'operation',
      },
      async (activeSpan) => {
        activeSpan.setAttribute(
          'news.fetched_count',
          10,
        );

        return 'result';
      },
    );

    expect(setAttribute).toHaveBeenCalledWith(
      'news.fetched_count',
      10,
    );
  });
});
