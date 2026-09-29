import {
  researchBudgetSchema,
  type ResearchBudget,
  type ResearchStopReason,
} from '@genai-news/shared';

export type ResearchExecutionSnapshot = Readonly<{
  modelCalls: number;
  toolCalls: number;
  elapsedMs: number;
  remainingModelCalls: number;
  remainingToolCalls: number;
  deadlineExceeded: boolean;
}>;

type ResearchBudgetStopReason = Extract<
  ResearchStopReason,
  'tool-budget-exhausted' | 'model-budget-exhausted' | 'deadline-exceeded'
>;

export type ResearchExecutionPolicyOptions = Readonly<{
  budget: ResearchBudget;
  now?: () => number;
}>;

export class ResearchExecutionPolicy {
  private readonly budget: ResearchBudget;
  private readonly now: () => number;
  private readonly startedAtMs: number;

  private modelCalls = 0;
  private toolCalls = 0;

  constructor(options: ResearchExecutionPolicyOptions) {
    this.budget = Object.freeze(researchBudgetSchema.parse(options.budget));

    this.now = options.now ?? (() => Date.now());
    this.startedAtMs = this.now();
  }

  getSnapshot(): ResearchExecutionSnapshot {
    const elapsedMs = this.getElapsedMs();

    return Object.freeze({
      modelCalls: this.modelCalls,
      toolCalls: this.toolCalls,
      elapsedMs,
      remainingModelCalls: Math.max(0, this.budget.maxModelCalls - this.modelCalls),
      remainingToolCalls: Math.max(0, this.budget.maxToolCalls - this.toolCalls),
      deadlineExceeded: elapsedMs >= this.budget.timeoutMs,
    });
  }

  checkBeforeModelCall(): ResearchBudgetStopReason | null {
    if (this.isDeadlineExceeded()) {
      return 'deadline-exceeded';
    }

    if (this.modelCalls >= this.budget.maxModelCalls) {
      return 'model-budget-exhausted';
    }

    return null;
  }

  reserveModelCall(): ResearchExecutionSnapshot {
    const stopReason = this.checkBeforeModelCall();

    if (stopReason !== null) {
      throw new ResearchExecutionBudgetError(stopReason);
    }

    this.modelCalls += 1;

    return this.getSnapshot();
  }

  checkBeforeToolCall(): ResearchBudgetStopReason | null {
    if (this.isDeadlineExceeded()) {
      return 'deadline-exceeded';
    }

    if (this.toolCalls >= this.budget.maxToolCalls) {
      return 'tool-budget-exhausted';
    }

    return null;
  }

  reserveToolCall(): ResearchExecutionSnapshot {
    const stopReason = this.checkBeforeToolCall();

    if (stopReason !== null) {
      throw new ResearchExecutionBudgetError(stopReason);
    }

    this.toolCalls += 1;

    return this.getSnapshot();
  }

  checkDeadline(): Extract<ResearchBudgetStopReason, 'deadline-exceeded'> | null {
    return this.isDeadlineExceeded() ? 'deadline-exceeded' : null;
  }

  getRemainingTimeoutMs(): number {
    return Math.max(0, this.budget.timeoutMs - this.getElapsedMs());
  }

  private getElapsedMs(): number {
    return Math.max(0, this.now() - this.startedAtMs);
  }

  private isDeadlineExceeded(): boolean {
    return this.getElapsedMs() >= this.budget.timeoutMs;
  }
}

export class ResearchExecutionBudgetError extends Error {
  constructor(
    readonly stopReason: Extract<
      ResearchBudgetStopReason,
      'tool-budget-exhausted' | 'model-budget-exhausted' | 'deadline-exceeded'
    >,
  ) {
    super(`Research execution stopped: ${stopReason}`);
    this.name = 'ResearchExecutionBudgetError';
  }
}
