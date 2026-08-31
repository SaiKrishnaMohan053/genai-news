export const STORY_CLUSTERING_EVALUATION_TAGS = [
  'clear-same-story',
  'clear-different-story',
  'headline-variation',
  'publisher-independent',
  'time-variation',
  'same-entity-different-event',
  'same-keywords-different-event',
  'difficult-boundary',
  'multi-article',
  'transitive-bridge',
  'ordering-stability',
  'incremental-replay',
] as const;

export type StoryClusteringEvaluationTag = (typeof STORY_CLUSTERING_EVALUATION_TAGS)[number];

/**
 * Minimal deterministic representation of a persisted article needed by the
 * Phase 2 evaluation corpus.
 *
 * This deliberately does not depend on Prisma or @genai-news/database.
 * The corpus must remain runnable without PostgreSQL.
 */
export type StoryClusteringEvaluationArticle = {
  id: string;

  title: string;
  canonicalUrl: string;

  publisherName: string | null;

  publishedAt: Date | null;
};

/**
 * Ground-truth story membership.
 *
 * clusterId exists only inside the evaluation scenario. It is not expected to
 * equal a runtime Story id.
 */
export type ExpectedStoryCluster = {
  clusterId: string;
  articleIds: readonly string[];
};

/**
 * Optional processing order used later to evaluate incremental/replay
 * behavior.
 *
 * Article ids may repeat intentionally to represent job replay.
 */
export type StoryClusteringProcessingSequence = {
  id: string;
  articleIds: readonly string[];
};

export type StoryClusteringEvaluationScenario = {
  id: string;
  description: string;

  tags: readonly StoryClusteringEvaluationTag[];

  articles: readonly StoryClusteringEvaluationArticle[];

  expectedClusters: readonly ExpectedStoryCluster[];

  processingSequences?: readonly StoryClusteringProcessingSequence[];
};

export type StoryClusteringEvaluationCorpus = {
  id: string;
  description: string;

  scenarios: readonly StoryClusteringEvaluationScenario[];
};
