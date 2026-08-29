import type { AppMetricsRegistry } from './metrics.js';

export type NewsDiscoveryStatus = 'completed' | 'failed';

export interface NewsDiscoveryMetrics {
  jobsTotal: {
    inc(labels: { source_id: string; status: NewsDiscoveryStatus }): void;
  };

  articlesFetchedTotal: {
    inc(labels: { source_id: string }, value?: number): void;
  };

  articlesNormalizedTotal: {
    inc(labels: { source_id: string }, value?: number): void;
  };

  articlesNormalizationRejectedTotal: {
    inc(labels: { source_id: string }, value?: number): void;
  };

  articlesFreshTotal: {
    inc(labels: { source_id: string }, value?: number): void;
  };

  articlesFreshnessRejectedTotal: {
    inc(labels: { source_id: string }, value?: number): void;
  };

  articlesUniqueTotal: {
    inc(labels: { source_id: string }, value?: number): void;
  };

  articlesDuplicatesTotal: {
    inc(labels: { source_id: string }, value?: number): void;
  };

  articlesPersistedTotal: {
    inc(labels: { source_id: string }, value?: number): void;
  };

  discoveryDurationSeconds: {
    observe(labels: { source_id: string }, value: number): void;
  };

  discoveryEnqueueTotal: {
    inc(labels: { source_id: string; status: 'accepted' | 'failed' }): void;
  };

  discoveryEnqueueDurationSeconds: {
    observe(
      labels: {
        source_id: string;
      },
      value: number,
    ): void;
  };

  sourceFetchDurationSeconds: {
    observe(labels: { source_id: string }, value: number): void;
  };

  persistenceDurationSeconds: {
    observe(labels: { source_id: string }, value: number): void;
  };
}

const DURATION_BUCKETS_SECONDS = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30];

export function createNewsDiscoveryMetrics(metrics: AppMetricsRegistry): NewsDiscoveryMetrics {
  return {
    jobsTotal: metrics.counter({
      name: 'genai_news_discovery_jobs_total',
      help: 'Total number of news discovery jobs.',
      labelNames: ['source_id', 'status'] as const,
    }),

    articlesFetchedTotal: metrics.counter({
      name: 'genai_news_articles_fetched_total',
      help: 'Total number of source articles fetched.',
      labelNames: ['source_id'] as const,
    }),

    articlesNormalizedTotal: metrics.counter({
      name: 'genai_news_articles_normalized_total',
      help: 'Total number of articles successfully normalized.',
      labelNames: ['source_id'] as const,
    }),

    articlesNormalizationRejectedTotal: metrics.counter({
      name: 'genai_news_articles_normalization_rejected_total',
      help: 'Total number of articles rejected during normalization.',
      labelNames: ['source_id'] as const,
    }),

    articlesFreshTotal: metrics.counter({
      name: 'genai_news_articles_fresh_total',
      help: 'Total number of articles accepted by the freshness policy.',
      labelNames: ['source_id'] as const,
    }),

    articlesFreshnessRejectedTotal: metrics.counter({
      name: 'genai_news_articles_freshness_rejected_total',
      help: 'Total number of articles rejected by the freshness policy.',
      labelNames: ['source_id'] as const,
    }),

    articlesUniqueTotal: metrics.counter({
      name: 'genai_news_articles_unique_total',
      help: 'Total number of unique articles after deterministic deduplication.',
      labelNames: ['source_id'] as const,
    }),

    articlesDuplicatesTotal: metrics.counter({
      name: 'genai_news_articles_duplicates_total',
      help: 'Total number of duplicate articles removed.',
      labelNames: ['source_id'] as const,
    }),

    articlesPersistedTotal: metrics.counter({
      name: 'genai_news_articles_persisted_total',
      help: 'Total number of articles persisted.',
      labelNames: ['source_id'] as const,
    }),

    discoveryDurationSeconds: metrics.histogram({
      name: 'genai_news_discovery_duration_seconds',
      help: 'End-to-end news discovery job duration.',
      labelNames: ['source_id'] as const,
      buckets: DURATION_BUCKETS_SECONDS,
    }),

    discoveryEnqueueTotal: metrics.counter({
      name: 'genai_news_discovery_enqueue_total',
      help: 'Total number of news discovery enqueue attempts.',
      labelNames: ['source_id', 'status'] as const,
    }),

    discoveryEnqueueDurationSeconds: metrics.histogram({
      name: 'genai_news_discovery_enqueue_duration_seconds',
      help: 'Duration of news discovery queue enqueue operations.',
      labelNames: ['source_id'] as const,
      buckets: DURATION_BUCKETS_SECONDS,
    }),

    sourceFetchDurationSeconds: metrics.histogram({
      name: 'genai_news_source_fetch_duration_seconds',
      help: 'Duration of source news retrieval.',
      labelNames: ['source_id'] as const,
      buckets: DURATION_BUCKETS_SECONDS,
    }),

    persistenceDurationSeconds: metrics.histogram({
      name: 'genai_news_persistence_duration_seconds',
      help: 'Duration of article persistence for a discovery job.',
      labelNames: ['source_id'] as const,
      buckets: DURATION_BUCKETS_SECONDS,
    }),
  };
}
