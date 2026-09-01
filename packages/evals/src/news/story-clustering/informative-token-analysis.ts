import { extractStoryFeatures } from '@genai-news/shared';

import type { StoryClusteringEvaluationCorpus } from './contracts.js';

import type { StoryClusteringLabelledPair } from './pairwise-analysis.js';

export type StoryTokenStatistics = {
  documentCount: number;

  documentFrequencyByToken: ReadonlyMap<string, number>;

  inverseDocumentFrequencyByToken: ReadonlyMap<string, number>;
};

export type StoryInformativeTokenPair = {
  scenarioId: string;

  leftArticleId: string;
  rightArticleId: string;

  expectedSameStory: boolean;

  weightedTokenJaccard: number;
};

export type StoryInformativeTokenAnalysis = {
  tokenStatistics: StoryTokenStatistics;

  pairs: readonly StoryInformativeTokenPair[];

  positivePairs: readonly StoryInformativeTokenPair[];

  negativePairs: readonly StoryInformativeTokenPair[];

  positiveSummary: StoryInformativeTokenNumericSummary;

  negativeSummary: StoryInformativeTokenNumericSummary;
};

export type StoryInformativeTokenNumericSummary = {
  count: number;
  min: number | null;
  mean: number | null;
  max: number | null;
};

/**
 * Calculates deterministic document-frequency statistics over evaluation
 * titles.
 *
 * Each title counts a token at most once toward document frequency.
 */
export function buildStoryTokenStatistics(
  corpus: StoryClusteringEvaluationCorpus,
): StoryTokenStatistics {
  const documentFrequencyByToken = new Map<string, number>();

  let documentCount = 0;

  for (const scenario of corpus.scenarios) {
    for (const article of scenario.articles) {
      documentCount += 1;

      const features = extractStoryFeatures({
        id: article.id,
        title: article.title,
        publishedAt: article.publishedAt,
        publisherName: article.publisherName,
      });

      const uniqueTokens = new Set(features.titleTokens);

      for (const token of uniqueTokens) {
        documentFrequencyByToken.set(token, (documentFrequencyByToken.get(token) ?? 0) + 1);
      }
    }
  }

  if (documentCount === 0) {
    throw new Error('Cannot build story token statistics from an empty corpus.');
  }

  const inverseDocumentFrequencyByToken = new Map<string, number>();

  for (const [token, documentFrequency] of documentFrequencyByToken) {
    /**
     * Smoothed IDF:
     *
     * ln((N + 1) / (df + 1)) + 1
     *
     * This keeps every observed token weight positive while lowering the
     * influence of tokens that appear across many titles.
     */
    const idf = Math.log((documentCount + 1) / (documentFrequency + 1)) + 1;

    inverseDocumentFrequencyByToken.set(token, idf);
  }

  return {
    documentCount,
    documentFrequencyByToken,
    inverseDocumentFrequencyByToken,
  };
}

export function calculateWeightedTokenJaccard(
  leftTokens: readonly string[],
  rightTokens: readonly string[],
  tokenWeights: ReadonlyMap<string, number>,
): number {
  const left = new Set(leftTokens);
  const right = new Set(rightTokens);

  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  const union = new Set([...left, ...right]);

  let intersectionWeight = 0;
  let unionWeight = 0;

  for (const token of union) {
    const weight = tokenWeights.get(token);

    if (weight === undefined || !Number.isFinite(weight) || weight <= 0) {
      throw new Error(`Missing or invalid informative-token weight for token: ${token}`);
    }

    unionWeight += weight;

    if (left.has(token) && right.has(token)) {
      intersectionWeight += weight;
    }
  }

  return unionWeight === 0 ? 0 : intersectionWeight / unionWeight;
}

export function analyzeInformativeTokenSimilarity(
  corpus: StoryClusteringEvaluationCorpus,
  labelledPairs: readonly StoryClusteringLabelledPair[],
): StoryInformativeTokenAnalysis {
  const tokenStatistics = buildStoryTokenStatistics(corpus);

  const articleTokens = buildArticleTokenMap(corpus);

  const pairs = labelledPairs.map((pair) => {
    const leftTokens = articleTokens.get(pair.leftArticleId);

    const rightTokens = articleTokens.get(pair.rightArticleId);

    if (leftTokens === undefined || rightTokens === undefined) {
      throw new Error(
        `Missing story article tokens for pair ${pair.leftArticleId} ↔ ${pair.rightArticleId}.`,
      );
    }

    return {
      scenarioId: pair.scenarioId,

      leftArticleId: pair.leftArticleId,
      rightArticleId: pair.rightArticleId,

      expectedSameStory: pair.expectedSameStory,

      weightedTokenJaccard: calculateWeightedTokenJaccard(
        leftTokens,
        rightTokens,
        tokenStatistics.inverseDocumentFrequencyByToken,
      ),
    };
  });

  const positivePairs = pairs.filter((pair) => pair.expectedSameStory);

  const negativePairs = pairs.filter((pair) => !pair.expectedSameStory);

  return {
    tokenStatistics,

    pairs,
    positivePairs,
    negativePairs,

    positiveSummary: summarizeInformativePairs(positivePairs),

    negativeSummary: summarizeInformativePairs(negativePairs),
  };
}

function buildArticleTokenMap(
  corpus: StoryClusteringEvaluationCorpus,
): ReadonlyMap<string, readonly string[]> {
  const result = new Map<string, readonly string[]>();

  for (const scenario of corpus.scenarios) {
    for (const article of scenario.articles) {
      if (result.has(article.id)) {
        throw new Error(`Duplicate evaluation article id across corpus: ${article.id}`);
      }

      const features = extractStoryFeatures({
        id: article.id,
        title: article.title,
        publishedAt: article.publishedAt,
        publisherName: article.publisherName,
      });

      result.set(article.id, features.titleTokens);
    }
  }

  return result;
}

function summarizeInformativePairs(
  pairs: readonly StoryInformativeTokenPair[],
): StoryInformativeTokenNumericSummary {
  if (pairs.length === 0) {
    return {
      count: 0,
      min: null,
      mean: null,
      max: null,
    };
  }

  const values = pairs.map((pair) => pair.weightedTokenJaccard);

  return {
    count: values.length,

    min: Math.min(...values),

    mean: values.reduce((total, value) => total + value, 0) / values.length,

    max: Math.max(...values),
  };
}
