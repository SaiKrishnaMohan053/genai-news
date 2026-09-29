import type { ResearchBudget } from '@genai-news/shared';

import { ResearchExecutionPolicy } from './execution-policy.js';

export type ResearchExecutionScopeOptions = Readonly<{
  budget: ResearchBudget;
  signal?: AbortSignal;
  now?: () => number;
}>;

export class ResearchExecutionScope implements Disposable {
  readonly policy: ResearchExecutionPolicy;
  readonly signal: AbortSignal;

  private readonly controller = new AbortController();
  private readonly timeout: ReturnType<typeof setTimeout>;
  private readonly callerSignal: AbortSignal | undefined;
  private readonly onCallerAbort: (() => void) | undefined;
  private deadlineExceeded = false;
  private disposed = false;

  constructor(options: ResearchExecutionScopeOptions) {
    this.policy = new ResearchExecutionPolicy({
      budget: options.budget,
      ...(options.now === undefined ? {} : { now: options.now }),
    });

    this.signal = this.controller.signal;
    this.callerSignal = options.signal;

    if (options.signal?.aborted) {
      this.controller.abort(options.signal.reason);
    }

    if (options.signal !== undefined && !options.signal.aborted) {
      this.onCallerAbort = () => {
        this.controller.abort(options.signal?.reason);
      };

      options.signal.addEventListener('abort', this.onCallerAbort, { once: true });
    }

    this.timeout = setTimeout(() => {
      if (this.controller.signal.aborted) {
        return;
      }

      this.deadlineExceeded = true;

      this.controller.abort(new ResearchExecutionDeadlineError());
    }, options.budget.timeoutMs);
  }

  getDeadlineExceeded(): boolean {
    return this.deadlineExceeded;
  }

  throwIfAborted(): void {
    this.signal.throwIfAborted();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    clearTimeout(this.timeout);

    if (this.callerSignal !== undefined && this.onCallerAbort !== undefined) {
      this.callerSignal.removeEventListener('abort', this.onCallerAbort);
    }
  }

  [Symbol.dispose](): void {
    this.dispose();
  }
}

export class ResearchExecutionDeadlineError extends Error {
  readonly stopReason = 'deadline-exceeded' as const;

  constructor() {
    super('Research execution deadline exceeded');
    this.name = 'ResearchExecutionDeadlineError';
  }
}
