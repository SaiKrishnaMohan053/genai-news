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
 * Minimal persisted-article shape required by deterministic story feature
 * extraction.
 *
 * This intentionally avoids importing Prisma or @genai-news/database so the
 * story capability remains a pure shared-domain dependency.
 */
export type StoryFeatureArticle = {
  id: StoryArticleId;

  title: string;

  publishedAt: Date | null;

  publisherName: string | null;
};

/**
 * Deterministic lexical and metadata features prepared for later story
 * candidate generation and similarity analysis.
 *
 * Feature extraction does not calculate similarity, weights, thresholds, or
 * clustering decisions.
 */
export type StoryFeatures = {
  articleId: StoryArticleId;

  /**
   * Human-readable title after the existing Phase 1 text normalization
   * contract: NFC + whitespace normalization + trim.
   */
  title: string;

  /**
   * Case-normalized lexical representation of title.
   *
   * Punctuation is preserved here. Token extraction handles lexical
   * boundaries separately so the feature layer does not unnecessarily erase
   * information.
   */
  normalizedTitle: string;

  /**
   * Ordered lexical tokens.
   *
   * Order and duplicates are intentionally preserved so later similarity
   * algorithms can choose whether they need sequence, frequency, or set
   * semantics.
   */
  titleTokens: readonly string[];

  publishedAt: Date | null;

  publisherName: string | null;
};

/**
 * Minimal canonical-story state required by candidate generation.
 *
 * Candidate generation deliberately does not depend on story members,
 * representatives, similarity scores, or persistence-specific timestamps.
 */
export type StoryCandidate = {
  storyId: StoryId;

  firstPublishedAt: Date | null;
  lastPublishedAt: Date | null;
};

/**
 * Configurable deterministic candidate-generation policy.
 *
 * Phase 2.4 deliberately defines no production default. Candidate-window
 * values must later be selected using evaluation evidence.
 */
export type StoryCandidateGenerationPolicy = {
  maxTimeDistanceMs: number;

  /**
   * Conservative behavior when either the incoming article or candidate story
   * lacks enough publication-time information to calculate temporal distance.
   */
  includeWhenTimeUnknown: boolean;
};

export const STORY_CANDIDATE_REASONS = [
  'within-time-window',
  'time-overlap',
  'time-unknown',
  'outside-time-window',
] as const;

export type StoryCandidateReason = (typeof STORY_CANDIDATE_REASONS)[number];

export type StoryCandidateDecision = {
  storyId: StoryId;

  included: boolean;

  reason: StoryCandidateReason;

  /**
   * Distance from the article publication timestamp to the nearest edge of
   * the candidate story's publication interval.
   *
   * Zero means the article timestamp falls inside the story interval.
   * Null means temporal distance could not be calculated.
   */
  timeDistanceMs: number | null;
};

export type StoryCandidateGenerationResult = {
  candidates: readonly StoryCandidate[];

  decisions: readonly StoryCandidateDecision[];

  totalStories: number;
  candidateCount: number;
  excludedCount: number;
};

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
