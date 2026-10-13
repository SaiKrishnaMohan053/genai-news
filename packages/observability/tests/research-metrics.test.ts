import { describe, expect, it } from 'vitest';

import { createMetricsRegistry } from '../src/metrics.js';
import { createResearchMetrics } from '../src/research-metrics.js';

describe('research metrics', () => {
  it('records research execution metrics with bounded labels', async () => {
    const registry = createMetricsRegistry({
      service: 'worker',
      environment: 'test',
      collectDefaults: false,
    });

    const metrics = createResearchMetrics(registry);

    metrics.executionsTotal.inc({
      outcome: 'partial',
      stop_reason: 'model-budget-exhausted',
    });

    metrics.executionDurationSeconds.observe(
      {
        outcome: 'partial',
      },
      2.5,
    );

    metrics.modelCallsTotal.inc(3);
    metrics.toolCallsTotal.inc(5);

    metrics.selectedSourcesTotal.inc(
      {
        outcome: 'partial',
      },
      4,
    );

    metrics.unresolvedQuestionsTotal.inc(
      {
        outcome: 'partial',
      },
      2,
    );

    const output = await registry.metrics();

    expect(output).toContain('genai_news_research_executions_total');
    expect(output).toContain('outcome="partial"');
    expect(output).toContain('stop_reason="model-budget-exhausted"');

    expect(output).toContain('genai_news_research_execution_duration_seconds');

    expect(output).toContain('genai_news_research_model_calls_total');
    expect(output).toContain('genai_news_research_model_calls_total{');
    expect(output).toContain('} 3');

    expect(output).toContain('genai_news_research_tool_calls_total');
    expect(output).toContain('} 5');

    expect(output).toContain('genai_news_research_selected_sources_total');
    expect(output).toContain('} 4');

    expect(output).toContain('genai_news_research_unresolved_questions_total');
    expect(output).toContain('} 2');
  });
});