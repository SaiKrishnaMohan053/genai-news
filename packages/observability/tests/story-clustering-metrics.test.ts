import { describe, expect, it } from 'vitest';

import { createMetricsRegistry, createStoryClusteringMetrics } from '../src/index.js';

describe('story clustering metrics', () => {
  it('records story clustering metrics', async () => {
    const registry = createMetricsRegistry({
      service: 'worker',
      environment: 'test',
      collectDefaults: false,
    });

    const metrics = createStoryClusteringMetrics(registry);

    metrics.attemptsTotal.inc({
      outcome: 'assigned_existing_story',
    });

    metrics.candidatesTotal.inc(3);

    metrics.semanticComparisonsTotal.inc(3);

    metrics.clusteringDurationSeconds.observe(0.25);

    metrics.candidateGenerationDurationSeconds.observe(0.01);

    metrics.semanticComparisonDurationSeconds.observe(0.2);

    const output = await registry.metrics();

    expect(output).toContain('genai_news_story_clustering_attempts_total');

    expect(output).toContain('outcome="assigned_existing_story"');

    expect(output).toContain('genai_news_story_candidates_total');

    expect(output).toContain('genai_news_story_semantic_comparisons_total');

    expect(output).toContain('genai_news_story_clustering_duration_seconds');

    expect(output).toContain('genai_news_story_candidate_generation_duration_seconds');

    expect(output).toContain('genai_news_story_semantic_comparison_duration_seconds');
  });
});
