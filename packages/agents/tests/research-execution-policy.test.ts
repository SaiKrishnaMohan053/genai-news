import type { ResearchBudget } from '@genai-news/shared';
import { describe, expect, it } from 'vitest';

import {
  ResearchExecutionBudgetError,
  ResearchExecutionPolicy,
} from '../src/research/execution-policy.js';

const budget: ResearchBudget = {
  maxToolCalls: 3,
  maxModelCalls: 2,
  timeoutMs: 10_000,
  maxSelectedSources: 5,
  maxUnresolvedQuestions: 3,
  maxQuestionLength: 300,
};

describe('research execution policy', () => {
  it('starts with the full configured call budget', () => {
    const policy = new ResearchExecutionPolicy({
      budget,
      now: () => 1000,
    });

    expect(policy.getSnapshot()).toEqual({
      modelCalls: 0,
      toolCalls: 0,
      elapsedMs: 0,
      remainingModelCalls: 2,
      remainingToolCalls: 3,
      deadlineExceeded: false,
    });
  });

  it('reserves model calls before execution', () => {
    const policy = new ResearchExecutionPolicy({
      budget,
      now: () => 1000,
    });

    expect(policy.reserveModelCall()).toMatchObject({
      modelCalls: 1,
      remainingModelCalls: 1,
    });

    expect(policy.reserveModelCall()).toMatchObject({
      modelCalls: 2,
      remainingModelCalls: 0,
    });
  });

  it('stops before a model call beyond budget', () => {
    const policy = new ResearchExecutionPolicy({
      budget,
      now: () => 1000,
    });

    policy.reserveModelCall();
    policy.reserveModelCall();

    expect(policy.checkBeforeModelCall()).toBe('model-budget-exhausted');

    expect(() => policy.reserveModelCall()).toThrow(ResearchExecutionBudgetError);

    expect(policy.getSnapshot().modelCalls).toBe(2);
  });

  it('reserves tool calls independently from model calls', () => {
    const policy = new ResearchExecutionPolicy({
      budget,
      now: () => 1000,
    });

    policy.reserveModelCall();
    policy.reserveToolCall();
    policy.reserveToolCall();

    expect(policy.getSnapshot()).toMatchObject({
      modelCalls: 1,
      toolCalls: 2,
      remainingModelCalls: 1,
      remainingToolCalls: 1,
    });
  });

  it('stops before a tool call beyond budget', () => {
    const policy = new ResearchExecutionPolicy({
      budget,
      now: () => 1000,
    });

    policy.reserveToolCall();
    policy.reserveToolCall();
    policy.reserveToolCall();

    expect(policy.checkBeforeToolCall()).toBe('tool-budget-exhausted');

    expect(() => policy.reserveToolCall()).toThrow(ResearchExecutionBudgetError);

    expect(policy.getSnapshot().toolCalls).toBe(3);
  });

  it('marks the deadline exceeded at the configured boundary', () => {
    let now = 1000;

    const policy = new ResearchExecutionPolicy({
      budget,
      now: () => now,
    });

    now = 10_999;

    expect(policy.checkDeadline()).toBeNull();

    now = 11_000;

    expect(policy.checkDeadline()).toBe('deadline-exceeded');

    expect(policy.getSnapshot().deadlineExceeded).toBe(true);
  });

  it('deadline takes precedence over model budget exhaustion', () => {
    let now = 1000;

    const policy = new ResearchExecutionPolicy({
      budget: {
        ...budget,
        maxModelCalls: 1,
      },
      now: () => now,
    });

    policy.reserveModelCall();

    now = 11_000;

    expect(policy.checkBeforeModelCall()).toBe('deadline-exceeded');
  });

  it('deadline takes precedence over tool budget exhaustion', () => {
    let now = 1000;

    const policy = new ResearchExecutionPolicy({
      budget: {
        ...budget,
        maxToolCalls: 1,
      },
      now: () => now,
    });

    policy.reserveToolCall();

    now = 11_000;

    expect(policy.checkBeforeToolCall()).toBe('deadline-exceeded');
  });

  it('reports remaining deadline time', () => {
    let now = 1000;

    const policy = new ResearchExecutionPolicy({
      budget,
      now: () => now,
    });

    expect(policy.getRemainingTimeoutMs()).toBe(10_000);

    now = 4000;

    expect(policy.getRemainingTimeoutMs()).toBe(7000);

    now = 20_000;

    expect(policy.getRemainingTimeoutMs()).toBe(0);
  });

  it('never reports negative elapsed time', () => {
    let now = 1000;

    const policy = new ResearchExecutionPolicy({
      budget,
      now: () => now,
    });

    now = 900;

    expect(policy.getSnapshot().elapsedMs).toBe(0);
  });

  it('rejects invalid research budgets', () => {
    expect(
      () =>
        new ResearchExecutionPolicy({
          budget: {
            ...budget,
            maxModelCalls: 0,
          },
        }),
    ).toThrow();
  });

  it('exposes the exact stop reason through budget errors', () => {
    const policy = new ResearchExecutionPolicy({
      budget: {
        ...budget,
        maxModelCalls: 1,
      },
      now: () => 1000,
    });

    policy.reserveModelCall();

    try {
      policy.reserveModelCall();

      throw new Error('Expected budget error');
    } catch (error) {
      expect(error).toBeInstanceOf(ResearchExecutionBudgetError);

      if (!(error instanceof ResearchExecutionBudgetError)) {
        throw error;
      }

      expect(error.stopReason).toBe('model-budget-exhausted');
    }
  });
});
