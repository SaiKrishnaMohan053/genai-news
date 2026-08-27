import { createArticleRepository, type DatabaseClient } from '@genai-news/database';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { AppError } from '../errors/app-error.js';

const articleQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(25),
});

interface NewsArticleRouteOptions {
  database?: DatabaseClient;
}

export const newsArticleRoutes: FastifyPluginAsync<NewsArticleRouteOptions> = async (
  app,
  options,
) => {
  app.get('/api/news/articles', async (request) => {
    if (!options.database) {
      throw new AppError('Article storage is unavailable', 503, 'ARTICLE_STORAGE_UNAVAILABLE');
    }

    const parsed = articleQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      throw new AppError('Invalid article list request', 400, 'INVALID_ARTICLE_LIST_REQUEST');
    }

    const repository = createArticleRepository(options.database);

    const articles = await repository.listRecent({
      limit: parsed.data.limit,
    });

    return {
      articles: articles.map((article) => ({
        id: article.id,

        title: article.title,
        url: article.url,
        canonicalUrl: article.canonicalUrl,

        source: {
          id: article.sourceId,
          name: article.sourceName,
          type: article.sourceType,
        },

        publisher:
          article.publisherName === null
            ? null
            : {
                id: article.publisherId,
                name: article.publisherName,
              },

        publishedAt: article.publishedAt?.toISOString() ?? null,

        firstDiscoveredAt: article.firstDiscoveredAt.toISOString(),

        lastSeenAt: article.lastSeenAt.toISOString(),

        author: article.author,
        summary: article.summary,
        category: article.category,
      })),
    };
  });
};
