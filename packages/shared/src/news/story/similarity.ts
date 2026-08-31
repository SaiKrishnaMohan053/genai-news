import type { StoryFeatures, StoryPairwiseSimilarityResult } from './contracts.js';

export type CompareStoryFeaturesInput = {
  left: StoryFeatures;
  right: StoryFeatures;
};

/**
 * Computes independent deterministic pairwise signals between two persisted
 * article feature sets.
 *
 * This function does not:
 *
 * - calculate a composite score;
 * - apply weights;
 * - apply a match threshold;
 * - return match/no-match;
 * - assign story membership;
 * - mutate either feature object.
 */
export function compareStoryFeatures(
  input: CompareStoryFeaturesInput,
): StoryPairwiseSimilarityResult {
  validateComparableFeatures(input.left, 'left');
  validateComparableFeatures(input.right, 'right');

  if (input.left.articleId === input.right.articleId) {
    throw new Error(
      `Cannot compare story features for the same article id: ${input.left.articleId}`,
    );
  }

  return {
    leftArticleId: input.left.articleId,
    rightArticleId: input.right.articleId,

    signals: {
      titleTokenJaccard: calculateTokenJaccardSimilarity(
        input.left.titleTokens,
        input.right.titleTokens,
      ),

      titleTokenOrderSimilarity: calculateTokenOrderSimilarity(
        input.left.titleTokens,
        input.right.titleTokens,
      ),

      publicationTimeDistanceMs: calculatePublicationTimeDistanceMs(
        input.left.publishedAt,
        input.right.publishedAt,
      ),
    },
  };
}

/**
 * Calculates Jaccard similarity using unique token membership:
 *
 * intersection(A, B) / union(A, B)
 *
 * Duplicate tokens deliberately do not increase this signal.
 */
export function calculateTokenJaccardSimilarity(
  leftTokens: readonly string[],
  rightTokens: readonly string[],
): number {
  const left = new Set(leftTokens);
  const right = new Set(rightTokens);

  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let intersectionSize = 0;

  for (const token of left) {
    if (right.has(token)) {
      intersectionSize += 1;
    }
  }

  const unionSize = left.size + right.size - intersectionSize;

  return intersectionSize / unionSize;
}

/**
 * Calculates an order-sensitive token similarity using the longest common
 * subsequence (LCS).
 *
 * LCS length is normalized by the larger token sequence length so the result
 * remains within [0, 1].
 *
 * Title token sequences are small, making the O(n*m) dynamic-programming cost
 * appropriate for the initial deterministic baseline.
 */
export function calculateTokenOrderSimilarity(
  leftTokens: readonly string[],
  rightTokens: readonly string[],
): number {
  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return 0;
  }

  const previous = new Array<number>(rightTokens.length + 1).fill(0);

  const current = new Array<number>(rightTokens.length + 1).fill(0);

  for (let leftIndex = 1; leftIndex <= leftTokens.length; leftIndex += 1) {
    current[0] = 0;

    for (let rightIndex = 1; rightIndex <= rightTokens.length; rightIndex += 1) {
      if (leftTokens[leftIndex - 1] === rightTokens[rightIndex - 1]) {
        current[rightIndex] = previous[rightIndex - 1]! + 1;
      } else {
        current[rightIndex] = Math.max(previous[rightIndex]!, current[rightIndex - 1]!);
      }
    }

    for (let index = 0; index < current.length; index += 1) {
      previous[index] = current[index]!;
    }
  }

  const longestCommonSubsequenceLength = previous[rightTokens.length]!;

  return longestCommonSubsequenceLength / Math.max(leftTokens.length, rightTokens.length);
}

/**
 * Returns absolute publication-time distance.
 *
 * No normalization or time-decay policy is applied in Phase 2.5.
 */
export function calculatePublicationTimeDistanceMs(
  left: Date | null,
  right: Date | null,
): number | null {
  if (left === null || right === null) {
    return null;
  }

  validateDate(left, 'Left story feature publishedAt');

  validateDate(right, 'Right story feature publishedAt');

  return Math.abs(left.getTime() - right.getTime());
}

function validateComparableFeatures(features: StoryFeatures, side: 'left' | 'right'): void {
  if (features.articleId.trim().length === 0) {
    throw new Error(`${capitalize(side)} story feature articleId must be a non-empty string.`);
  }

  if (features.publishedAt !== null) {
    validateDate(features.publishedAt, `${capitalize(side)} story feature publishedAt`);
  }
}

function validateDate(value: Date, field: string): void {
  if (Number.isNaN(value.getTime())) {
    throw new Error(`${field} must be a valid Date.`);
  }
}

function capitalize(value: 'left' | 'right'): 'Left' | 'Right' {
  return value === 'left' ? 'Left' : 'Right';
}
