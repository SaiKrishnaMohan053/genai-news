import type { DatabaseClient } from '@genai-news/database';

import type { SemanticEmbeddingClient } from '@genai-news/tools';

import type { StoryCandidateGenerationPolicy } from '@genai-news/shared';

import { createDatabaseStoryCandidateProvider } from './candidate-provider.js';

import {
  createStoryClusteringArticleReader,
  createStoryClusteringMembershipReader,
  createStoryClusteringPersistence,
} from './database-adapters.js';

import { createSemanticStorySimilarityProvider } from './semantic-similarity-provider.js';

import { createStoryClusteringService } from './story-clustering-service.js';

import { createUuidStoryIdFactory } from './story-id-factory.js';

export type CreateProductionStoryClusteringServiceInput = {
  database: DatabaseClient;

  embeddingClient: SemanticEmbeddingClient;

  candidatePolicy: StoryCandidateGenerationPolicy;
};

export function createProductionStoryClusteringService(
  input: CreateProductionStoryClusteringServiceInput,
) {
  return createStoryClusteringService({
    articleReader: createStoryClusteringArticleReader(input.database),

    membershipReader: createStoryClusteringMembershipReader(input.database),

    candidateProvider: createDatabaseStoryCandidateProvider({
      database: input.database,

      policy: input.candidatePolicy,
    }),

    semanticSimilarity: createSemanticStorySimilarityProvider(input.embeddingClient),

    persistence: createStoryClusteringPersistence(input.database),

    storyIdFactory: createUuidStoryIdFactory(),
  });
}
