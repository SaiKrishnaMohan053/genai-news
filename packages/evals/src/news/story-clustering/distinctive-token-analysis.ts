import { extractStoryFeatures } from '@genai-news/shared';

import type { StoryClusteringEvaluationCorpus } from './contracts.js';

import type { StoryClusteringLabelledPair } from './pairwise-analysis.js';

import {
  buildStoryTokenStatistics,
  type StoryTokenStatistics,
} from './informative-token-analysis.js';

export type StoryDistinctiveTokenPair = {
  scenarioId: string;

  leftArticleId: string;
  rightArticleId: string;

  expectedSameStory: boolean;

  maximumDocumentFrequency: number;

  leftDistinctiveTokenCount: number;
  rightDistinctiveTokenCount: number;

  sharedDistinctiveTokenCount: number;

  distinctiveTokenJaccard: number;
};

export type StoryDistinctiveTokenSummary = {
  count: number;

  sharedDistinctiveTokenCount: StoryDistinctiveTokenNumericSummary;

  distinctiveTokenJaccard: StoryDistinctiveTokenNumericSummary;
};

export type StoryDistinctiveTokenNumericSummary = {
  min: number | null;
  mean: number | null;
  max: number | null;
};

export type StoryDistinctiveTokenCutoffAnalysis = {
  maximumDocumentFrequency: number;

  pairs: readonly StoryDistinctiveTokenPair[];

  positivePairs: readonly StoryDistinctiveTokenPair[];

  negativePairs: readonly StoryDistinctiveTokenPair[];

  positiveSummary: StoryDistinctiveTokenSummary;

  negativeSummary: StoryDistinctiveTokenSummary;
};

export type StoryDistinctiveTokenAnalysis = {
  tokenStatistics: StoryTokenStatistics;

  cutoffs: readonly StoryDistinctiveTokenCutoffAnalysis[];
};

/**
 * Evaluates every observed document-frequency cutoff.
 *
 * A token is considered distinctive for a cutoff when:
 *
 * documentFrequency(token) <= maximumDocumentFrequency
 */
export function analyzeDistinctiveTokens(
  corpus: StoryClusteringEvaluationCorpus,
  labelledPairs: readonly StoryClusteringLabelledPair[],
): StoryDistinctiveTokenAnalysis {
  const tokenStatistics = buildStoryTokenStatistics(corpus);

  const articleTokens = buildArticleTokenMap(corpus);

  const observedDocumentFrequencies = uniqueSorted([
    ...tokenStatistics.documentFrequencyByToken.values(),
  ]);

  const cutoffs = observedDocumentFrequencies.map((maximumDocumentFrequency) =>
    analyzeCutoff(labelledPairs, articleTokens, tokenStatistics, maximumDocumentFrequency),
  );

  return {
    tokenStatistics,
    cutoffs,
  };
}

export function calculateDistinctiveTokenJaccard(
  leftTokens: readonly string[],
  rightTokens: readonly string[],
  documentFrequencyByToken: ReadonlyMap<string, number>,
  maximumDocumentFrequency: number,
): {
  leftDistinctiveTokenCount: number;
  rightDistinctiveTokenCount: number;
  sharedDistinctiveTokenCount: number;
  distinctiveTokenJaccard: number;
} {
  validateCutoff(maximumDocumentFrequency);

  const leftDistinctive = selectDistinctiveTokens(
    leftTokens,
    documentFrequencyByToken,
    maximumDocumentFrequency,
  );

  const rightDistinctive = selectDistinctiveTokens(
    rightTokens,
    documentFrequencyByToken,
    maximumDocumentFrequency,
  );

  const union = new Set([...leftDistinctive, ...rightDistinctive]);

  let sharedDistinctiveTokenCount = 0;

  for (const token of leftDistinctive) {
    if (rightDistinctive.has(token)) {
      sharedDistinctiveTokenCount += 1;
    }
  }

  return {
    leftDistinctiveTokenCount: leftDistinctive.size,

    rightDistinctiveTokenCount: rightDistinctive.size,

    sharedDistinctiveTokenCount,

    distinctiveTokenJaccard: union.size === 0 ? 0 : sharedDistinctiveTokenCount / union.size,
  };
}

function analyzeCutoff(
  labelledPairs: readonly StoryClusteringLabelledPair[],
  articleTokens: ReadonlyMap<string, readonly string[]>,
  tokenStatistics: StoryTokenStatistics,
  maximumDocumentFrequency: number,
): StoryDistinctiveTokenCutoffAnalysis {
  const pairs = labelledPairs.map((pair) => {
    const leftTokens = articleTokens.get(pair.leftArticleId);

    const rightTokens = articleTokens.get(pair.rightArticleId);

    if (leftTokens === undefined || rightTokens === undefined) {
      throw new Error(
        `Missing story article tokens for pair ${pair.leftArticleId} ↔ ${pair.rightArticleId}.`,
      );
    }

    const distinctive = calculateDistinctiveTokenJaccard(
      leftTokens,
      rightTokens,
      tokenStatistics.documentFrequencyByToken,
      maximumDocumentFrequency,
    );

    return {
      scenarioId: pair.scenarioId,

      leftArticleId: pair.leftArticleId,
      rightArticleId: pair.rightArticleId,

      expectedSameStory: pair.expectedSameStory,

      maximumDocumentFrequency,

      ...distinctive,
    };
  });

  const positivePairs = pairs.filter((pair) => pair.expectedSameStory);

  const negativePairs = pairs.filter((pair) => !pair.expectedSameStory);

  return {
    maximumDocumentFrequency,

    pairs,
    positivePairs,
    negativePairs,

    positiveSummary: summarizePairs(positivePairs),

    negativeSummary: summarizePairs(negativePairs),
  };
}

function selectDistinctiveTokens(
  tokens: readonly string[],
  documentFrequencyByToken: ReadonlyMap<string, number>,
  maximumDocumentFrequency: number,
): ReadonlySet<string> {
  const result = new Set<string>();

  for (const token of tokens) {
    const documentFrequency = documentFrequencyByToken.get(token);

    if (documentFrequency === undefined) {
      throw new Error(`Missing document frequency for token: ${token}`);
    }

    if (documentFrequency <= maximumDocumentFrequency) {
      result.add(token);
    }
  }

  return result;
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

function summarizePairs(pairs: readonly StoryDistinctiveTokenPair[]): StoryDistinctiveTokenSummary {
  return {
    count: pairs.length,

    sharedDistinctiveTokenCount: summarize(pairs.map((pair) => pair.sharedDistinctiveTokenCount)),

    distinctiveTokenJaccard: summarize(pairs.map((pair) => pair.distinctiveTokenJaccard)),
  };
}

function summarize(values: readonly number[]): StoryDistinctiveTokenNumericSummary {
  if (values.length === 0) {
    return {
      min: null,
      mean: null,
      max: null,
    };
  }

  return {
    min: Math.min(...values),

    mean: values.reduce((total, value) => total + value, 0) / values.length,

    max: Math.max(...values),
  };
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function validateCutoff(maximumDocumentFrequency: number): void {
  if (!Number.isInteger(maximumDocumentFrequency) || maximumDocumentFrequency <= 0) {
    throw new Error('Distinctive-token maximumDocumentFrequency must be a positive integer.');
  }
}
