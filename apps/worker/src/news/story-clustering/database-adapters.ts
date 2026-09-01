import {
  createStoryRepository,
  type DatabaseClient,
} from '@genai-news/database';

import type {
  StoryArticleId,
  StoryId,
} from '@genai-news/shared';

import type {
  StoryClusteringArticleReader,
  StoryClusteringMembershipReader,
  StoryClusteringPersistence,
} from './story-clustering-service.js';

export function createStoryClusteringArticleReader(
  database: DatabaseClient,
): StoryClusteringArticleReader {
  return {
    async findById(articleId) {
      const article =
        await database.article.findUnique({
          where: {
            id: articleId,
          },

          select: {
            id: true,
            title: true,
            publishedAt: true,
          },
        });

      if (article === null) {
        return null;
      }

      return {
        id:
          article.id as StoryArticleId,

        title:
          article.title,

        publishedAt:
          article.publishedAt,
      };
    },
  };
}

export function createStoryClusteringMembershipReader(
  database: DatabaseClient,
): StoryClusteringMembershipReader {
  const repository =
    createStoryRepository(database);

  return {
    async findByArticleId(articleId) {
      const membership =
        await repository
          .findMembershipByArticleId(
            articleId,
          );

      if (membership === null) {
        return null;
      }

      return {
        storyId:
          membership.storyId as StoryId,

        articleId:
          membership.articleId as StoryArticleId,
      };
    },
  };
}

export function createStoryClusteringPersistence(
  database: DatabaseClient,
): StoryClusteringPersistence {
  const repository =
    createStoryRepository(database);

  return {
    async createSeedStory(input) {
      const result =
        await repository.createSeedStory({
          storyId:
            input.storyId,

          seedArticleId:
            input.seedArticleId,

          canonicalTitle:
            input.canonicalTitle,

          clusteringVersion:
            input.clusteringVersion,
        });

      return {
        story: {
          id:
            result.story.id,
        },

        created:
          result.created,
      };
    },

    async addMatchedMembership(
      input,
    ) {
      const result =
        await repository
          .addMatchedMembership({
            storyId:
              input.storyId,

            articleId:
              input.articleId,

            representativeArticleId:
              input
                .representativeArticleId,

            matchDecision:
              input.matchDecision,
          });

      return {
        story: {
          id:
            result.story.id,
        },

        created:
          result.created,
      };
    },
  };
}