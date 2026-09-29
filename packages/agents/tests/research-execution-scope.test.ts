import type { ResearchBudget } from '@genai-news/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ResearchExecutionDeadlineError,
  ResearchExecutionScope,
} from '../src/research/execution-scope.js';

const budget: ResearchBudget = {
  maxToolCalls: 3,
  maxModelCalls: 2,
  timeoutMs: 1000,
  maxSelectedSources: 5,
  maxUnresolvedQuestions: 3,
  maxQuestionLength: 300,
};

afterEach(() => {
  vi.useRealTimers();
});

describe('research execution scope', () => {
  it('exposes a non-aborted signal initially', () => {
    const scope = new ResearchExecutionScope({
      budget,
    });

    expect(scope.signal.aborted).toBe(false);
    expect(scope.getDeadlineExceeded()).toBe(false);

    scope.dispose();
  });

  it('owns a budget policy for the same execution', () => {
    const scope = new ResearchExecutionScope({
      budget,
      now: () => 1000,
    });

    expect(scope.policy.getSnapshot()).toMatchObject({
      modelCalls: 0,
      toolCalls: 0,
      remainingModelCalls: 2,
      remainingToolCalls: 3,
    });

    scope.dispose();
  });

  it('propagates caller cancellation', () => {
    const caller = new AbortController();

    const scope = new ResearchExecutionScope({
      budget,
      signal: caller.signal,
    });

    caller.abort(new Error('caller cancelled'));

    expect(scope.signal.aborted).toBe(true);
    expect(scope.signal.reason).toBeInstanceOf(Error);
    expect(scope.signal.reason.message).toBe('caller cancelled');

    scope.dispose();
  });

  it('starts aborted when caller signal is already aborted', () => {
    const caller = new AbortController();

    caller.abort(new Error('already cancelled'));

    const scope = new ResearchExecutionScope({
      budget,
      signal: caller.signal,
    });

    expect(scope.signal.aborted).toBe(true);
    expect(scope.signal.reason.message).toBe('already cancelled');

    scope.dispose();
  });

  it('aborts when the wall-clock deadline expires', () => {
    vi.useFakeTimers();

    const scope = new ResearchExecutionScope({
      budget,
    });

    vi.advanceTimersByTime(999);

    expect(scope.signal.aborted).toBe(false);

    vi.advanceTimersByTime(1);

    expect(scope.signal.aborted).toBe(true);
    expect(scope.signal.reason).toBeInstanceOf(ResearchExecutionDeadlineError);

    expect(scope.getDeadlineExceeded()).toBe(true);

    scope.dispose();
  });

  it('exposes deadline-exceeded through the deadline error', () => {
    const error = new ResearchExecutionDeadlineError();

    expect(error.stopReason).toBe('deadline-exceeded');
    expect(error.name).toBe('ResearchExecutionDeadlineError');
  });

  it('throwIfAborted propagates cancellation reason', () => {
    const caller = new AbortController();

    const scope = new ResearchExecutionScope({
      budget,
      signal: caller.signal,
    });

    caller.abort(new Error('stop now'));

    expect(() => scope.throwIfAborted()).toThrow('stop now');

    scope.dispose();
  });

  it('disposal cancels the execution deadline timer', () => {
    vi.useFakeTimers();

    const scope = new ResearchExecutionScope({
      budget,
    });

    scope.dispose();

    vi.advanceTimersByTime(5000);

    expect(scope.signal.aborted).toBe(false);
  });

  it('dispose is idempotent', () => {
    const scope = new ResearchExecutionScope({
      budget,
    });

    expect(() => {
      scope.dispose();
      scope.dispose();
    }).not.toThrow();
  });

  it('caller cancellation wins over later deadline expiry', () => {
    vi.useFakeTimers();

    const caller = new AbortController();

    const scope = new ResearchExecutionScope({
      budget,
      signal: caller.signal,
    });

    caller.abort(new Error('caller cancelled'));

    vi.advanceTimersByTime(2000);

    expect(scope.signal.reason.message).toBe('caller cancelled');

    expect(scope.getDeadlineExceeded()).toBe(false);

    scope.dispose();
  });
});
