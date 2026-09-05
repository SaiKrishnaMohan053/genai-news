import { createStoryRepository, type DatabaseClient } from '@genai-news/database';

import type { FastifyPluginAsync } from 'fastify';

import { z } from 'zod';

import { AppError } from '../errors/app-error.js';

const storyListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(25),
});

const storyParamsSchema = z.object({
  storyId: z.string().trim().min(1),
});

interface NewsStoryRouteOptions {
  database?: DatabaseClient;
}

export const newsStoryRoutes: FastifyPluginAsync<NewsStoryRouteOptions> = async (app, options) => {
  app.get(
    '/api/news/stories',

    async (request) => {
      if (!options.database) {
        throw new AppError('Story storage is unavailable', 503, 'STORY_STORAGE_UNAVAILABLE');
      }

      const parsed = storyListQuerySchema.safeParse(request.query);

      if (!parsed.success) {
        throw new AppError('Invalid story list request', 400, 'INVALID_STORY_LIST_REQUEST');
      }

      const repository = createStoryRepository(options.database);

      const stories = await repository.listRecent({
        limit: parsed.data.limit,
      });

      return {
        stories: stories.map((story) => ({
          id: story.id,

          canonicalTitle: story.canonicalTitle,

          seedArticleId: story.seedArticleId,

          representativeArticleId: story.representativeArticleId,

          clusteringVersion: story.clusteringVersion,

          firstPublishedAt: story.firstPublishedAt?.toISOString() ?? null,

          lastPublishedAt: story.lastPublishedAt?.toISOString() ?? null,

          membershipCount: story.membershipCount,

          createdAt: story.createdAt.toISOString(),

          updatedAt: story.updatedAt.toISOString(),
        })),
      };
    },
  );

  app.get(
    '/api/news/stories/:storyId',

    async (request) => {
      if (!options.database) {
        throw new AppError('Story storage is unavailable', 503, 'STORY_STORAGE_UNAVAILABLE');
      }

      const parsed = storyParamsSchema.safeParse(request.params);

      if (!parsed.success) {
        throw new AppError('Invalid story request', 400, 'INVALID_STORY_REQUEST');
      }

      const repository = createStoryRepository(options.database);

      const story = await repository.findDetailById(parsed.data.storyId);

      if (story === null) {
        throw new AppError('Story not found', 404, 'STORY_NOT_FOUND');
      }

      return {
        story: {
          id: story.id,

          canonicalTitle: story.canonicalTitle,

          seedArticleId: story.seedArticleId,

          representativeArticleId: story.representativeArticleId,

          clusteringVersion: story.clusteringVersion,

          firstPublishedAt: story.firstPublishedAt?.toISOString() ?? null,

          lastPublishedAt: story.lastPublishedAt?.toISOString() ?? null,

          createdAt: story.createdAt.toISOString(),

          updatedAt: story.updatedAt.toISOString(),

          memberships: story.memberships.map((membership) => ({
            id: membership.id,

            kind: membership.kind,

            score: membership.score,

            signals: membership.signals,

            reason: membership.reason,

            matchedAgainstArticleId: membership.matchedAgainstArticleId,

            clusteringVersion: membership.clusteringVersion,

            createdAt: membership.createdAt.toISOString(),

            article: {
              id: membership.article.id,

              title: membership.article.title,

              url: membership.article.url,

              canonicalUrl: membership.article.canonicalUrl,

              source: {
                id: membership.article.sourceId,

                name: membership.article.sourceName,

                type: membership.article.sourceType,
              },

              publisher:
                membership.article.publisherName === null
                  ? null
                  : {
                      id: membership.article.publisherId,

                      name: membership.article.publisherName,
                    },

              publishedAt: membership.article.publishedAt?.toISOString() ?? null,

              firstDiscoveredAt: membership.article.firstDiscoveredAt.toISOString(),

              lastSeenAt: membership.article.lastSeenAt.toISOString(),
            },
          })),
        },
      };
    },
  );
};
