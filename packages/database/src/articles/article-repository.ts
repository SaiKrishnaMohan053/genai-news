import { randomUUID } from 'node:crypto';

import type { NormalizedArticle } from '@genai-news/shared';

import type { DatabaseClient } from '../client.js';

export type PersistedArticle = {
  id: string;

  title: string;
  url: string;
  canonicalUrl: string;

  sourceId: string;
  sourceName: string;
  sourceType: string;

  publisherId: string | null;
  publisherName: string | null;

  externalId: string | null;

  publishedAt: Date | null;
  firstDiscoveredAt: Date;
  lastSeenAt: Date;

  author: string | null;
  summary: string | null;
  category: string | null;

  metadata: unknown;

  createdAt: Date;
  updatedAt: Date;
};

export type ListRecentArticlesInput = {
  limit: number;
};
export type ArticleRepository = {
  persist(article: NormalizedArticle): Promise<PersistedArticle>;

  findByCanonicalUrl(canonicalUrl: string): Promise<PersistedArticle | null>;

  listRecent(input: ListRecentArticlesInput): Promise<PersistedArticle[]>;
};

export function createArticleRepository(database: DatabaseClient): ArticleRepository {
  return {
    async persist(article: NormalizedArticle): Promise<PersistedArticle> {
      validateArticleDates(article);

      const metadataJson = article.metadata === null ? null : JSON.stringify(article.metadata);

      const rows = await database.$queryRaw<PersistedArticle[]>`
        INSERT INTO "articles" (
          "id",
          "title",
          "url",
          "canonicalUrl",
          "sourceId",
          "sourceName",
          "sourceType",
          "publisherId",
          "publisherName",
          "externalId",
          "publishedAt",
          "firstDiscoveredAt",
          "lastSeenAt",
          "author",
          "summary",
          "category",
          "metadata",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          ${randomUUID()},
          ${article.title},
          ${article.url},
          ${article.canonicalUrl},
          ${article.source.id},
          ${article.source.name},
          ${article.source.type},
          ${article.publisher?.id ?? null},
          ${article.publisher?.name ?? null},
          ${article.externalId},
          ${article.publishedAt},
          ${article.discoveredAt},
          ${article.discoveredAt},
          ${article.author},
          ${article.summary},
          ${article.category},
          ${metadataJson}::jsonb,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
        ON CONFLICT ("canonicalUrl")
        DO UPDATE SET
          "firstDiscoveredAt" = LEAST(
            "articles"."firstDiscoveredAt",
            EXCLUDED."firstDiscoveredAt"
          ),

          "lastSeenAt" = GREATEST(
            "articles"."lastSeenAt",
            EXCLUDED."lastSeenAt"
          ),

          "title" = CASE
            WHEN EXCLUDED."lastSeenAt" >= "articles"."lastSeenAt"
              THEN EXCLUDED."title"
            ELSE "articles"."title"
          END,

          "url" = CASE
            WHEN EXCLUDED."lastSeenAt" >= "articles"."lastSeenAt"
              THEN EXCLUDED."url"
            ELSE "articles"."url"
          END,

          "sourceId" = CASE
            WHEN EXCLUDED."lastSeenAt" >= "articles"."lastSeenAt"
              THEN EXCLUDED."sourceId"
            ELSE "articles"."sourceId"
          END,

          "sourceName" = CASE
            WHEN EXCLUDED."lastSeenAt" >= "articles"."lastSeenAt"
              THEN EXCLUDED."sourceName"
            ELSE "articles"."sourceName"
          END,

          "sourceType" = CASE
            WHEN EXCLUDED."lastSeenAt" >= "articles"."lastSeenAt"
              THEN EXCLUDED."sourceType"
            ELSE "articles"."sourceType"
          END,

          "publisherId" = CASE
            WHEN EXCLUDED."lastSeenAt" >= "articles"."lastSeenAt"
              THEN EXCLUDED."publisherId"
            ELSE "articles"."publisherId"
          END,

          "publisherName" = CASE
            WHEN EXCLUDED."lastSeenAt" >= "articles"."lastSeenAt"
              THEN EXCLUDED."publisherName"
            ELSE "articles"."publisherName"
          END,

          "externalId" = CASE
            WHEN EXCLUDED."lastSeenAt" >= "articles"."lastSeenAt"
              THEN EXCLUDED."externalId"
            ELSE "articles"."externalId"
          END,

          "publishedAt" = CASE
            WHEN EXCLUDED."lastSeenAt" >= "articles"."lastSeenAt"
              THEN EXCLUDED."publishedAt"
            ELSE "articles"."publishedAt"
          END,

          "author" = CASE
            WHEN EXCLUDED."lastSeenAt" >= "articles"."lastSeenAt"
              THEN EXCLUDED."author"
            ELSE "articles"."author"
          END,

          "summary" = CASE
            WHEN EXCLUDED."lastSeenAt" >= "articles"."lastSeenAt"
              THEN EXCLUDED."summary"
            ELSE "articles"."summary"
          END,

          "category" = CASE
            WHEN EXCLUDED."lastSeenAt" >= "articles"."lastSeenAt"
              THEN EXCLUDED."category"
            ELSE "articles"."category"
          END,

          "metadata" = CASE
            WHEN EXCLUDED."lastSeenAt" >= "articles"."lastSeenAt"
              THEN EXCLUDED."metadata"
            ELSE "articles"."metadata"
          END,

          "updatedAt" = CURRENT_TIMESTAMP

        RETURNING
          "id",
          "title",
          "url",
          "canonicalUrl",
          "sourceId",
          "sourceName",
          "sourceType",
          "publisherId",
          "publisherName",
          "externalId",
          "publishedAt",
          "firstDiscoveredAt",
          "lastSeenAt",
          "author",
          "summary",
          "category",
          "metadata",
          "createdAt",
          "updatedAt"
      `;

      const persisted = rows[0];

      if (persisted === undefined) {
        throw new Error('Article persistence returned no database row.');
      }

      return persisted;
    },

    async findByCanonicalUrl(canonicalUrl: string): Promise<PersistedArticle | null> {
      return database.article.findUnique({
        where: {
          canonicalUrl,
        },
      });
    },
    async listRecent(input: ListRecentArticlesInput): Promise<PersistedArticle[]> {
      if (!Number.isInteger(input.limit) || input.limit <= 0 || input.limit > 100) {
        throw new Error('Article list limit must be an integer between 1 and 100.');
      }

      return database.article.findMany({
        take: input.limit,

        orderBy: [
          {
            publishedAt: {
              sort: 'desc',
              nulls: 'last',
            },
          },
          {
            lastSeenAt: 'desc',
          },
          {
            id: 'asc',
          },
        ],
      });
    },
  };
}

function validateArticleDates(article: NormalizedArticle): void {
  if (Number.isNaN(article.discoveredAt.getTime())) {
    throw new Error('Article discoveredAt must be a valid Date.');
  }

  if (article.publishedAt !== null && Number.isNaN(article.publishedAt.getTime())) {
    throw new Error('Article publishedAt must be a valid Date when present.');
  }
}
