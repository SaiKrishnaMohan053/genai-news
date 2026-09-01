import type { DatabaseClient } from '@genai-news/database';

import {
  extractStoryFeatures,
  generateStoryCandidates,
  type StoryArticleId,
  type StoryCandidate,
  type StoryCandidateGenerationPolicy,
  type StoryId,
} from '@genai-news/shared';

import type {
  StoryClusteringCandidate,
  StoryClusteringCandidateProvider,
} from './story-clustering-service.js';

export type CreateDatabaseStoryCandidateProviderInput = {
  database: DatabaseClient;

  policy: StoryCandidateGenerationPolicy;
};

export function createDatabaseStoryCandidateProvider(
  input: CreateDatabaseStoryCandidateProviderInput,
): StoryClusteringCandidateProvider {
  validatePolicy(input.policy);

  return {
    async findCandidates(article): Promise<readonly StoryClusteringCandidate[]> {
      /**
       * Candidate generation only needs the deterministic
       * StoryFeatures contract. Publisher identity is not
       * currently used by the Phase 2.4 temporal filter.
       */
      const articleFeatures = extractStoryFeatures({
        id: article.id,

        title: article.title,

        publishedAt: article.publishedAt,

        publisherName: null,
      });

      /**
       * Load only temporal story state first.
       *
       * Do not eagerly load every representative article.
       */
      const persistedStories = await input.database.story.findMany({
        select: {
          id: true,

          firstPublishedAt: true,

          lastPublishedAt: true,
        },

        orderBy: {
          id: 'asc',
        },
      });

      const stories: StoryCandidate[] = persistedStories.map((story) => ({
        storyId: story.id as StoryId,

        firstPublishedAt: story.firstPublishedAt,

        lastPublishedAt: story.lastPublishedAt,
      }));

      const generated = generateStoryCandidates({
        article: articleFeatures,

        stories,

        policy: input.policy,
      });

      if (generated.candidates.length === 0) {
        return [];
      }

      const candidateStoryIds = generated.candidates.map((candidate) => candidate.storyId);

      /**
       * Only now load the representative articles
       * for stories that survived deterministic
       * candidate generation.
       */
      const candidateStories = await input.database.story.findMany({
        where: {
          id: {
            in: candidateStoryIds,
          },
        },

        select: {
          id: true,

          representativeArticle: {
            select: {
              id: true,
              title: true,
              publishedAt: true,
            },
          },
        },
      });

      const byStoryId = new Map<string, StoryClusteringCandidate>();

      for (const story of candidateStories) {
        byStoryId.set(story.id, {
          storyId: story.id as StoryId,

          representativeArticle: {
            id: story.representativeArticle.id as StoryArticleId,

            title: story.representativeArticle.title,

            publishedAt: story.representativeArticle.publishedAt,
          },
        });
      }

      /**
       * Preserve generateStoryCandidates() ordering rather
       * than depending on PostgreSQL IN-query ordering.
       */
      return generated.candidates.map((candidate) => {
        const resolved = byStoryId.get(candidate.storyId);

        if (resolved === undefined) {
          throw new Error(
            [
              'Candidate story representative could not be resolved.',
              `storyId=${candidate.storyId}`,
            ].join(' '),
          );
        }

        return resolved;
      });
    },
  };
}

function validatePolicy(policy: StoryCandidateGenerationPolicy): void {
  if (!Number.isFinite(policy.maxTimeDistanceMs) || policy.maxTimeDistanceMs < 0) {
    throw new Error('Story candidate maxTimeDistanceMs must be a finite non-negative number.');
  }
}
