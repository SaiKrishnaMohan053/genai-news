import type { ArticleRepository } from '@genai-news/database';
import {
  deduplicateArticles,
  evaluateArticleFreshness,
  normalizeSourceArticle,
  type FreshnessPolicy,
  type NewsSource,
  type NormalizedArticle,
} from '@genai-news/shared';
import { newsDiscoveryJobSchema, type NewsDiscoveryJobPayload } from '@genai-news/schemas';

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

  requestedAt: string;
  completedAt: string;
};

export type NewsDiscoveryDependencies = {
  sourceRegistry: NewsSourceRegistry;
  articleRepository: ArticleRepository;
  freshnessPolicy: FreshnessPolicy;
  now?: () => Date;
};

export async function processNewsDiscovery(
  payload: NewsDiscoveryJobPayload,
  dependencies: NewsDiscoveryDependencies,
): Promise<NewsDiscoveryResult> {
  const validatedPayload = newsDiscoveryJobSchema.parse(payload);

  const now = dependencies.now ?? (() => new Date());

  const source = dependencies.sourceRegistry.get(validatedPayload.sourceId);

  const fetched = await source.fetchLatest({
    limit: validatedPayload.limit,
  });

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

  const freshArticles: NormalizedArticle[] = [];

  let freshnessRejectedCount = 0;

  const freshnessNow = now();

  for (const article of normalizedArticles) {
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

  const deduplicated = deduplicateArticles(freshArticles);

  for (const article of deduplicated.uniqueArticles) {
    await dependencies.articleRepository.persist(article);
  }

  return {
    sourceId: source.id,

    fetchedCount: fetched.articles.length,

    normalizedCount: normalizedArticles.length,
    normalizationRejectedCount,

    freshCount: freshArticles.length,
    freshnessRejectedCount,

    uniqueCount: deduplicated.uniqueArticles.length,
    duplicateCount: deduplicated.duplicates.length,

    persistedCount: deduplicated.uniqueArticles.length,

    requestedAt: validatedPayload.requestedAt,
    completedAt: now().toISOString(),
  };
}
