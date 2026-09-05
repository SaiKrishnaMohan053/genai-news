import type { ArticleRepository } from '@genai-news/database';
import { runWithSpan, type NewsDiscoveryMetrics } from '@genai-news/observability';
import { newsDiscoveryJobSchema, type NewsDiscoveryJobPayload } from '@genai-news/schemas';
import {
  deduplicateArticles,
  evaluateArticleFreshness,
  normalizeSourceArticle,
  type FreshnessPolicy,
  type NormalizedArticle,
  type StoryArticleId,
} from '@genai-news/shared';

import type { NewsSourceRegistry } from '../news/source-registry.js';

export type NewsDiscoveryResult = {
  sourceId: string;

  fetchedCount: number;

  normalizedCount: number;
  normalizationRejectedCount: number;

  freshCount: number;
  freshnessRejectedCount: number;

  uniqueCount: number;
  duplicateCount: number;

  persistedCount: number;

  clusteredCount: number;
  alreadyAssignedCount: number;
  assignedExistingStoryCount: number;
  seededNewStoryCount: number;

  requestedAt: string;
  completedAt: string;
};

export type NewsDiscoveryStoryClusteringResult = {
  kind: 'already-assigned' | 'assigned-existing-story' | 'seeded-new-story';
};

export type NewsDiscoveryStoryClusterer = {
  clusterArticle(articleId: StoryArticleId): Promise<NewsDiscoveryStoryClusteringResult>;
};

export type NewsDiscoveryDependencies = {
  sourceRegistry: NewsSourceRegistry;

  articleRepository: ArticleRepository;

  storyClusterer: NewsDiscoveryStoryClusterer;

  freshnessPolicy: FreshnessPolicy;

  metrics?: NewsDiscoveryMetrics;

  now?: () => Date;
};

export async function processNewsDiscovery(
  payload: NewsDiscoveryJobPayload,
  dependencies: NewsDiscoveryDependencies,
): Promise<NewsDiscoveryResult> {
  const validatedPayload = newsDiscoveryJobSchema.parse(payload);

  const now = dependencies.now ?? (() => new Date());

  const source = dependencies.sourceRegistry.get(validatedPayload.sourceId);

  const sourceId = source.id;

  const fetchStartedAt = performance.now();

  const fetched = await runWithSpan(
    {
      tracerName: 'genai-news-worker',
      spanName: 'news.source.fetch',

      attributes: {
        'news.source.id': sourceId,
        'news.request.limit': validatedPayload.limit,
      },
    },

    async (span) => {
      const result = await source.fetchLatest({
        limit: validatedPayload.limit,
      });

      span.setAttribute('news.fetched_count', result.articles.length);

      return result;
    },
  );

  const fetchDurationSeconds = (performance.now() - fetchStartedAt) / 1000;

  dependencies.metrics?.sourceFetchDurationSeconds.observe(
    {
      source_id: sourceId,
    },
    fetchDurationSeconds,
  );

  dependencies.metrics?.articlesFetchedTotal.inc(
    {
      source_id: sourceId,
    },
    fetched.articles.length,
  );

  const normalizationResult = await runWithSpan(
    {
      tracerName: 'genai-news-worker',
      spanName: 'news.normalize',

      attributes: {
        'news.source.id': sourceId,
        'news.input_count': fetched.articles.length,
      },
    },

    async (span) => {
      const normalizedArticles: NormalizedArticle[] = [];

      let normalizationRejectedCount = 0;

      for (const article of fetched.articles) {
        const normalized = normalizeSourceArticle({
          source: fetched.source,
          article,
          discoveredAt: fetched.fetchedAt,
        });

        if (normalized.status === 'rejected') {
          normalizationRejectedCount += 1;
          continue;
        }

        normalizedArticles.push(normalized.article);
      }

      span.setAttribute('news.normalized_count', normalizedArticles.length);

      span.setAttribute('news.normalization_rejected_count', normalizationRejectedCount);

      return {
        normalizedArticles,
        normalizationRejectedCount,
      };
    },
  );

  dependencies.metrics?.articlesNormalizedTotal.inc(
    {
      source_id: sourceId,
    },
    normalizationResult.normalizedArticles.length,
  );

  dependencies.metrics?.articlesNormalizationRejectedTotal.inc(
    {
      source_id: sourceId,
    },
    normalizationResult.normalizationRejectedCount,
  );

  const freshnessNow = now();

  const freshnessResult = await runWithSpan(
    {
      tracerName: 'genai-news-worker',
      spanName: 'news.freshness',

      attributes: {
        'news.source.id': sourceId,
        'news.input_count': normalizationResult.normalizedArticles.length,
      },
    },

    async (span) => {
      const freshArticles: NormalizedArticle[] = [];

      let freshnessRejectedCount = 0;

      for (const article of normalizationResult.normalizedArticles) {
        const freshness = evaluateArticleFreshness({
          article,
          policy: dependencies.freshnessPolicy,
          now: freshnessNow,
        });

        if (!freshness.accepted) {
          freshnessRejectedCount += 1;
          continue;
        }

        freshArticles.push(article);
      }

      span.setAttribute('news.fresh_count', freshArticles.length);

      span.setAttribute('news.freshness_rejected_count', freshnessRejectedCount);

      return {
        freshArticles,
        freshnessRejectedCount,
      };
    },
  );

  dependencies.metrics?.articlesFreshTotal.inc(
    {
      source_id: sourceId,
    },
    freshnessResult.freshArticles.length,
  );

  dependencies.metrics?.articlesFreshnessRejectedTotal.inc(
    {
      source_id: sourceId,
    },
    freshnessResult.freshnessRejectedCount,
  );

  const deduplicated = await runWithSpan(
    {
      tracerName: 'genai-news-worker',
      spanName: 'news.deduplicate',

      attributes: {
        'news.source.id': sourceId,
        'news.input_count': freshnessResult.freshArticles.length,
      },
    },

    async (span) => {
      const result = deduplicateArticles(freshnessResult.freshArticles);

      span.setAttribute('news.unique_count', result.uniqueArticles.length);

      span.setAttribute('news.duplicate_count', result.duplicates.length);

      return result;
    },
  );

  dependencies.metrics?.articlesUniqueTotal.inc(
    {
      source_id: sourceId,
    },
    deduplicated.uniqueArticles.length,
  );

  dependencies.metrics?.articlesDuplicatesTotal.inc(
    {
      source_id: sourceId,
    },
    deduplicated.duplicates.length,
  );

  const persistenceStartedAt = performance.now();

  const workflowResult = await runWithSpan(
    {
      tracerName: 'genai-news-worker',
      spanName: 'news.persist-and-cluster',

      attributes: {
        'news.source.id': sourceId,
        'news.input_count': deduplicated.uniqueArticles.length,
      },
    },

    async (span) => {
      let persistedCount = 0;

      let clusteredCount = 0;

      let alreadyAssignedCount = 0;

      let assignedExistingStoryCount = 0;

      let seededNewStoryCount = 0;

      for (const article of deduplicated.uniqueArticles) {
        const persisted = await dependencies.articleRepository.persist(article);

        persistedCount += 1;

        const clustering = await dependencies.storyClusterer.clusterArticle(
          persisted.id as StoryArticleId,
        );

        clusteredCount += 1;

        switch (clustering.kind) {
          case 'already-assigned':
            alreadyAssignedCount += 1;
            break;

          case 'assigned-existing-story':
            assignedExistingStoryCount += 1;
            break;

          case 'seeded-new-story':
            seededNewStoryCount += 1;
            break;
        }
      }

      span.setAttribute('news.persisted_count', persistedCount);

      span.setAttribute('news.clustered_count', clusteredCount);

      span.setAttribute('news.clustered_already_assigned_count', alreadyAssignedCount);

      span.setAttribute('news.clustered_existing_story_count', assignedExistingStoryCount);

      span.setAttribute('news.clustered_seeded_story_count', seededNewStoryCount);

      return {
        persistedCount,
        clusteredCount,
        alreadyAssignedCount,
        assignedExistingStoryCount,
        seededNewStoryCount,
      };
    },
  );

  const persistenceDurationSeconds = (performance.now() - persistenceStartedAt) / 1000;

  dependencies.metrics?.persistenceDurationSeconds.observe(
    {
      source_id: sourceId,
    },
    persistenceDurationSeconds,
  );

  dependencies.metrics?.articlesPersistedTotal.inc(
    {
      source_id: sourceId,
    },
    workflowResult.persistedCount,
  );

  return {
    sourceId,

    fetchedCount: fetched.articles.length,

    normalizedCount: normalizationResult.normalizedArticles.length,

    normalizationRejectedCount: normalizationResult.normalizationRejectedCount,

    freshCount: freshnessResult.freshArticles.length,

    freshnessRejectedCount: freshnessResult.freshnessRejectedCount,

    uniqueCount: deduplicated.uniqueArticles.length,

    duplicateCount: deduplicated.duplicates.length,

    persistedCount: workflowResult.persistedCount,

    clusteredCount: workflowResult.clusteredCount,

    alreadyAssignedCount: workflowResult.alreadyAssignedCount,

    assignedExistingStoryCount: workflowResult.assignedExistingStoryCount,

    seededNewStoryCount: workflowResult.seededNewStoryCount,

    requestedAt: validatedPayload.requestedAt,

    completedAt: now().toISOString(),
  };
}
