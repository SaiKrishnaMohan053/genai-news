import {
  INITIAL_STORY_CLUSTERING_VERSION,
  type StoryArticleId,
  type StoryId,
} from './contracts.js';

export type StoryIdentityV1 = {
  /**
   * Stable logical identity of the story.
   *
   * The caller generates this id. This pure policy does not
   * generate UUIDs or depend on infrastructure.
   */
  storyId: StoryId;

  /**
   * The article that originally seeded the story.
   */
  seedArticleId: StoryArticleId;

  /**
   * Phase 2 v1 freezes the seed article as the representative
   * to prevent representative drift and implicit transitive
   * clustering.
   */
  representativeArticleId: StoryArticleId;

  /**
   * Human-readable title initially inherited from the
   * seed article.
   *
   * This is metadata, not story identity.
   */
  canonicalTitle: string;

  clusteringVersion: typeof INITIAL_STORY_CLUSTERING_VERSION;
};

export type StoryRepresentativeDecisionV1 = {
  decision: 'keep-existing-representative';

  representativeArticleId: StoryArticleId;

  incomingArticleId: StoryArticleId;

  reason: 'v1-seed-representative-is-stable';

  clusteringVersion: typeof INITIAL_STORY_CLUSTERING_VERSION;
};

export type StoryCanonicalTitleDecisionV1 = {
  decision: 'keep-existing-canonical-title';

  canonicalTitle: string;

  incomingTitle: string;

  reason: 'v1-canonical-title-is-not-automatically-rewritten';

  clusteringVersion: typeof INITIAL_STORY_CLUSTERING_VERSION;
};

/**
 * Creates the stable identity metadata for a newly seeded story.
 *
 * Story-id generation deliberately remains outside shared domain
 * logic so this function stays deterministic and infrastructure-free.
 */
export function createStoryIdentityV1(
  storyId: StoryId,
  seedArticleId: StoryArticleId,
  seedTitle: string,
): StoryIdentityV1 {
  assertStoryId(storyId);

  assertArticleId(seedArticleId, 'Seed article id');

  assertTitle(seedTitle, 'Seed title');

  return {
    storyId,

    seedArticleId,

    representativeArticleId: seedArticleId,

    canonicalTitle: seedTitle,

    clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
  };
}

/**
 * Phase 2 v1 representative policy.
 *
 * A matching article joins the story but never silently becomes
 * the new representative.
 *
 * This deliberately prevents:
 *
 * A matches B
 * B later becomes representative
 * C matches B but not A
 *
 * from turning into an implicit transitive story expansion.
 */
export function decideStoryRepresentativeV1(
  representativeArticleId: StoryArticleId,
  incomingArticleId: StoryArticleId,
): StoryRepresentativeDecisionV1 {
  assertArticleId(representativeArticleId, 'Representative article id');

  assertArticleId(incomingArticleId, 'Incoming article id');

  if (representativeArticleId === incomingArticleId) {
    throw new Error('Incoming article cannot already be the story representative.');
  }

  return {
    decision: 'keep-existing-representative',

    representativeArticleId,

    incomingArticleId,

    reason: 'v1-seed-representative-is-stable',

    clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
  };
}

/**
 * Phase 2 v1 canonical-title policy.
 *
 * We deliberately do not introduce an unevaluated title-selection
 * heuristic such as longest title, newest title, or publisher rank.
 *
 * Canonical title remains mutable metadata at the domain level,
 * but automatic clustering does not rewrite it in v1.
 */
export function decideCanonicalStoryTitleV1(
  canonicalTitle: string,
  incomingTitle: string,
): StoryCanonicalTitleDecisionV1 {
  assertTitle(canonicalTitle, 'Canonical title');

  assertTitle(incomingTitle, 'Incoming title');

  return {
    decision: 'keep-existing-canonical-title',

    canonicalTitle,

    incomingTitle,

    reason: 'v1-canonical-title-is-not-automatically-rewritten',

    clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
  };
}

function assertStoryId(storyId: StoryId): void {
  if (typeof storyId !== 'string' || storyId.trim().length === 0) {
    throw new Error('Story id must be non-empty.');
  }
}

function assertArticleId(articleId: StoryArticleId, label: string): void {
  if (typeof articleId !== 'string' || articleId.trim().length === 0) {
    throw new Error(`${label} must be non-empty.`);
  }
}

function assertTitle(title: string, label: string): void {
  if (typeof title !== 'string' || title.trim().length === 0) {
    throw new Error(`${label} must be non-empty.`);
  }

  if (title !== title.trim()) {
    throw new Error(`${label} must already be normalized.`);
  }
}
