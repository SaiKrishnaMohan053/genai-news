/**
 * Stable application identity for a canonical news story.
 *
 * Story identity must not depend on canonical title, representative article,
 * publisher, provider, or clustering score.
 */
export type StoryId = string;

/**
 * Stable persisted Article identity.
 *
 * Story clustering operates on persisted articles rather than provider
 * payloads or pre-persistence NormalizedArticle objects.
 */
export type StoryArticleId = string;

/**
 * Identifies the deterministic clustering implementation that produced a
 * decision or membership.
 *
 * This is deliberately separate from thresholds and feature configuration.
 */
export type StoryClusteringVersion = string;

export const INITIAL_STORY_CLUSTERING_VERSION = 'story-clustering-v1' as const;

/**
 * Provider-neutral representation of one canonical real-world news story.
 *
 * Persistence-specific fields such as createdAt/updatedAt and derived fields
 * such as articleCount are intentionally excluded from this domain contract.
 */
export type CanonicalStory = {
  id: StoryId;

  canonicalTitle: string;

  firstPublishedAt: Date | null;
  lastPublishedAt: Date | null;
};

/**
 * Individual deterministic similarity signals used to explain a match
 * decision.
 *
 * Signal names are intentionally not fixed in Phase 2.1. The concrete signal
 * set will be selected after the evaluation corpus and similarity design are
 * established.
 */
export type StoryMatchSignals = Readonly<Record<string, number>>;

export const STORY_MATCH_DECISIONS = ['match', 'no-match'] as const;

export type StoryMatchDecisionType = (typeof STORY_MATCH_DECISIONS)[number];

/**
 * Explainable result of comparing an article with a candidate story.
 *
 * score is normalized to [0, 1], but Phase 2.1 does not define how that score
 * is calculated or what threshold constitutes a match.
 */
export type StoryMatchDecision = {
  decision: StoryMatchDecisionType;

  score: number;

  signals: StoryMatchSignals;

  reason: string;

  clusteringVersion: StoryClusteringVersion;
};

/**
 * Explains why an article belongs to a canonical story.
 *
 * The first article in a story is a seed and therefore has no similarity
 * decision against an existing story.
 *
 * Later articles must preserve the match decision that caused the assignment
 * so clustering behavior can be inspected and evaluated.
 */
export type StoryMembershipProvenance =
  | {
      kind: 'seed';
      clusteringVersion: StoryClusteringVersion;
    }
  | {
      kind: 'matched';
      decision: StoryMatchDecision;
    };

export type StoryArticleMembership = {
  storyId: StoryId;
  articleId: StoryArticleId;

  provenance: StoryMembershipProvenance;
};
