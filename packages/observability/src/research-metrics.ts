import type { Counter, Histogram } from 'prom-client';

import type { AppMetricsRegistry } from './metrics.js';

export type ResearchOutcome =
  | 'complete'
  | 'partial'
  | 'insufficient-sources'
  | 'failed';

export type ResearchStopReason =
  | 'criteria-satisfied'
  | 'no-useful-results'
  | 'tool-budget-exhausted'
  | 'model-budget-exhausted'
  | 'deadline-exceeded'
  | 'terminal-failure';

export interface ResearchMetrics {
  executionsTotal: Counter<'outcome' | 'stop_reason'>;

  executionDurationSeconds: Histogram<'outcome'>;

  modelCallsTotal: Counter;

  toolCallsTotal: Counter;

  selectedSourcesTotal: Counter<'outcome'>;

  unresolvedQuestionsTotal: Counter<'outcome'>;
}

const RESEARCH_DURATION_BUCKETS_SECONDS = [
  0.1,
  0.25,
  0.5,
  1,
  2.5,
  5,
  10,
  15,
  30,
  60,
];

export function createResearchMetrics(metrics: AppMetricsRegistry): ResearchMetrics {
  return {
    executionsTotal: metrics.counter({
      name: 'genai_news_research_executions_total',
      help: 'Total number of completed research-agent executions by outcome and stop reason.',
      labelNames: ['outcome', 'stop_reason'] as const,
    }),

    executionDurationSeconds: metrics.histogram({
      name: 'genai_news_research_execution_duration_seconds',
      help: 'End-to-end duration of a research-agent execution.',
      labelNames: ['outcome'] as const,
      buckets: RESEARCH_DURATION_BUCKETS_SECONDS,
    }),

    modelCallsTotal: metrics.counter({
      name: 'genai_news_research_model_calls_total',
      help: 'Total number of model calls consumed by research-agent executions.',
    }),

    toolCallsTotal: metrics.counter({
      name: 'genai_news_research_tool_calls_total',
      help: 'Total number of tool calls consumed by research-agent executions.',
    }),

    selectedSourcesTotal: metrics.counter({
      name: 'genai_news_research_selected_sources_total',
      help: 'Total number of sources selected by research-agent executions.',
      labelNames: ['outcome'] as const,
    }),

    unresolvedQuestionsTotal: metrics.counter({
      name: 'genai_news_research_unresolved_questions_total',
      help: 'Total number of unresolved questions returned by research-agent executions.',
      labelNames: ['outcome'] as const,
    }),
  };
}
