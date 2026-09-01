import { INITIAL_STORY_CLUSTERING_VERSION, type StoryMatchDecision } from './contracts.js';

import { assertStoryMatchDecision } from './invariants.js';

/**
 * Phase 2 v1 semantic decision threshold.
 *
 * Selected from the frozen Phase 2 evaluation corpus after:
 *
 * - lexical overlap failed;
 * - token order failed;
 * - time proximity failed;
 * - IDF weighting failed;
 * - distinctive-token analysis improved but remained insufficient;
 * - semantic similarity produced clean separation:
 *
 *   highest observed different-story similarity ~= 0.682
 *   lowest observed same-story similarity       ~= 0.713
 *
 * 0.70 sits conservatively inside that measured separation gap without
 * encoding an exact corpus-specific midpoint.
 */
export const STORY_V1_SEMANTIC_MATCH_THRESHOLD = 0.7;

/**
 * Pure Phase 2 v1 story-match decision.
 *
 * Embedding generation does not belong here. The caller supplies the
 * semantic cosine similarity produced by the configured semantic model.
 */
export function decideStoryMatchV1(semanticSimilarity: number): StoryMatchDecision {
  validateSemanticSimilarity(semanticSimilarity);

  /**
   * StoryMatchSignals currently use normalized [0, 1] values.
   *
   * Cosine similarity can theoretically be negative. For the decision
   * provenance signal, a negative value is conservatively represented as 0.
   * It remains an obvious no-match and preserves the existing signal
   * invariant.
   */
  const normalizedSemanticSimilarity = Math.max(0, semanticSimilarity);

  const decision: StoryMatchDecision =
    semanticSimilarity >= STORY_V1_SEMANTIC_MATCH_THRESHOLD
      ? {
          decision: 'match',

          score: normalizedSemanticSimilarity,

          signals: {
            semanticSimilarity: normalizedSemanticSimilarity,
          },

          reason: 'semantic-similarity-at-or-above-v1-threshold',

          clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
        }
      : {
          decision: 'no-match',

          score: normalizedSemanticSimilarity,

          signals: {
            semanticSimilarity: normalizedSemanticSimilarity,
          },

          reason: 'semantic-similarity-below-v1-threshold',

          clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
        };

  assertStoryMatchDecision(decision);

  return decision;
}

function validateSemanticSimilarity(semanticSimilarity: number): void {
  if (!Number.isFinite(semanticSimilarity) || semanticSimilarity < -1 || semanticSimilarity > 1) {
    throw new Error('Semantic similarity must be a finite cosine similarity between -1 and 1.');
  }
}
