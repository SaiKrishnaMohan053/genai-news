import type { AppMetricsRegistry } from './metrics.js';

export type StoryClusteringOutcome =
  'already_assigned' | 'assigned_existing_story' | 'seeded_new_story' | 'failed';

export interface StoryClusteringMetrics {
  attemptsTotal: {
    inc(labels: { outcome: StoryClusteringOutcome }): void;
  };

  candidatesTotal: {
    inc(value?: number): void;
  };

  semanticComparisonsTotal: {
    inc(value?: number): void;
  };

  clusteringDurationSeconds: {
    observe(value: number): void;
  };

  candidateGenerationDurationSeconds: {
    observe(value: number): void;
  };

  semanticComparisonDurationSeconds: {
    observe(value: number): void;
  };
}

const STORY_DURATION_BUCKETS_SECONDS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

export function createStoryClusteringMetrics(metrics: AppMetricsRegistry): StoryClusteringMetrics {
  return {
    attemptsTotal: metrics.counter({
      name: 'genai_news_story_clustering_attempts_total',
      help: 'Total number of story clustering attempts by final outcome.',
      labelNames: ['outcome'] as const,
    }),

    candidatesTotal: metrics.counter({
      name: 'genai_news_story_candidates_total',
      help: 'Total number of story candidates evaluated by clustering.',
    }),

    semanticComparisonsTotal: metrics.counter({
      name: 'genai_news_story_semantic_comparisons_total',
      help: 'Total number of semantic candidate comparisons performed.',
    }),

    clusteringDurationSeconds: metrics.histogram({
      name: 'genai_news_story_clustering_duration_seconds',
      help: 'End-to-end duration of story clustering for one article.',
      buckets: STORY_DURATION_BUCKETS_SECONDS,
    }),

    candidateGenerationDurationSeconds: metrics.histogram({
      name: 'genai_news_story_candidate_generation_duration_seconds',
      help: 'Duration of deterministic story candidate generation.',
      buckets: STORY_DURATION_BUCKETS_SECONDS,
    }),

    semanticComparisonDurationSeconds: metrics.histogram({
      name: 'genai_news_story_semantic_comparison_duration_seconds',
      help: 'Duration of semantic comparison against story candidates.',
      buckets: STORY_DURATION_BUCKETS_SECONDS,
    }),
  };
}
