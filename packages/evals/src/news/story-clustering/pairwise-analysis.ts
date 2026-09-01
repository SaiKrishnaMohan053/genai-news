import {
  compareStoryFeatures,
  extractStoryFeatures,
  type StoryPairwiseSimilaritySignals,
} from '@genai-news/shared';

import type {
  StoryClusteringEvaluationArticle,
  StoryClusteringEvaluationCorpus,
  StoryClusteringEvaluationScenario,
} from './contracts.js';

export type StoryClusteringLabelledPair = {
  scenarioId: string;

  leftArticleId: string;
  rightArticleId: string;

  expectedSameStory: boolean;

  signals: StoryPairwiseSimilaritySignals;
};

export type StorySignalSummary = {
  count: number;

  titleTokenJaccard: NumericSignalSummary;

  titleTokenOrderSimilarity: NumericSignalSummary;

  publicationTimeDistanceMs: NullableNumericSignalSummary;
};

export type NumericSignalSummary = {
  min: number | null;
  mean: number | null;
  max: number | null;
};

export type NullableNumericSignalSummary = {
  evaluated: number;
  missing: number;

  min: number | null;
  mean: number | null;
  max: number | null;
};

export type StoryPairwiseAnalysisResult = {
  corpusId: string;

  pairs: readonly StoryClusteringLabelledPair[];

  positivePairs: readonly StoryClusteringLabelledPair[];
  negativePairs: readonly StoryClusteringLabelledPair[];

  positiveSummary: StorySignalSummary;
  negativeSummary: StorySignalSummary;
};

export function analyzeStoryClusteringPairs(
  corpus: StoryClusteringEvaluationCorpus,
): StoryPairwiseAnalysisResult {
  const pairs = corpus.scenarios.flatMap((scenario) => buildScenarioPairs(scenario));

  const positivePairs = pairs.filter((pair) => pair.expectedSameStory);

  const negativePairs = pairs.filter((pair) => !pair.expectedSameStory);

  return {
    corpusId: corpus.id,

    pairs,
    positivePairs,
    negativePairs,

    positiveSummary: summarizeSignals(positivePairs),
    negativeSummary: summarizeSignals(negativePairs),
  };
}

function buildScenarioPairs(
  scenario: StoryClusteringEvaluationScenario,
): StoryClusteringLabelledPair[] {
  const clusterIdByArticleId = new Map<string, string>();

  for (const cluster of scenario.expectedClusters) {
    for (const articleId of cluster.articleIds) {
      clusterIdByArticleId.set(articleId, cluster.clusterId);
    }
  }

  const pairs: StoryClusteringLabelledPair[] = [];

  for (let leftIndex = 0; leftIndex < scenario.articles.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < scenario.articles.length; rightIndex += 1) {
      const left = scenario.articles[leftIndex]!;
      const right = scenario.articles[rightIndex]!;

      const leftClusterId = clusterIdByArticleId.get(left.id);

      const rightClusterId = clusterIdByArticleId.get(right.id);

      if (leftClusterId === undefined || rightClusterId === undefined) {
        throw new Error(
          `Scenario ${scenario.id} contains article membership missing from expected clusters.`,
        );
      }

      const result = compareStoryFeatures({
        left: toStoryFeatures(left),
        right: toStoryFeatures(right),
      });

      pairs.push({
        scenarioId: scenario.id,

        leftArticleId: left.id,
        rightArticleId: right.id,

        expectedSameStory: leftClusterId === rightClusterId,

        signals: result.signals,
      });
    }
  }

  return pairs;
}

function toStoryFeatures(article: StoryClusteringEvaluationArticle) {
  return extractStoryFeatures({
    id: article.id,
    title: article.title,
    publishedAt: article.publishedAt,
    publisherName: article.publisherName,
  });
}

function summarizeSignals(pairs: readonly StoryClusteringLabelledPair[]): StorySignalSummary {
  return {
    count: pairs.length,

    titleTokenJaccard: summarizeRequired(pairs.map((pair) => pair.signals.titleTokenJaccard)),

    titleTokenOrderSimilarity: summarizeRequired(
      pairs.map((pair) => pair.signals.titleTokenOrderSimilarity),
    ),

    publicationTimeDistanceMs: summarizeNullable(
      pairs.map((pair) => pair.signals.publicationTimeDistanceMs),
    ),
  };
}

function summarizeRequired(values: readonly number[]): NumericSignalSummary {
  if (values.length === 0) {
    return {
      min: null,
      mean: null,
      max: null,
    };
  }

  return {
    min: Math.min(...values),
    mean: mean(values),
    max: Math.max(...values),
  };
}

function summarizeNullable(values: readonly (number | null)[]): NullableNumericSignalSummary {
  const evaluated = values.filter((value): value is number => value !== null);

  if (evaluated.length === 0) {
    return {
      evaluated: 0,
      missing: values.length,
      min: null,
      mean: null,
      max: null,
    };
  }

  return {
    evaluated: evaluated.length,
    missing: values.length - evaluated.length,

    min: Math.min(...evaluated),
    mean: mean(evaluated),
    max: Math.max(...evaluated),
  };
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function getMostLexicallySimilarNegativePairs(
  analysis: StoryPairwiseAnalysisResult,
  limit: number,
): readonly StoryClusteringLabelledPair[] {
  validateLimit(limit);

  return [...analysis.negativePairs].sort(compareLexicalStrengthDescending).slice(0, limit);
}

export function getLeastLexicallySimilarPositivePairs(
  analysis: StoryPairwiseAnalysisResult,
  limit: number,
): readonly StoryClusteringLabelledPair[] {
  validateLimit(limit);

  return [...analysis.positivePairs].sort(compareLexicalStrengthAscending).slice(0, limit);
}

function compareLexicalStrengthDescending(
  left: StoryClusteringLabelledPair,
  right: StoryClusteringLabelledPair,
): number {
  if (right.signals.titleTokenJaccard !== left.signals.titleTokenJaccard) {
    return right.signals.titleTokenJaccard - left.signals.titleTokenJaccard;
  }

  return right.signals.titleTokenOrderSimilarity - left.signals.titleTokenOrderSimilarity;
}

function compareLexicalStrengthAscending(
  left: StoryClusteringLabelledPair,
  right: StoryClusteringLabelledPair,
): number {
  if (left.signals.titleTokenJaccard !== right.signals.titleTokenJaccard) {
    return left.signals.titleTokenJaccard - right.signals.titleTokenJaccard;
  }

  return left.signals.titleTokenOrderSimilarity - right.signals.titleTokenOrderSimilarity;
}

function validateLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error('Story pair analysis limit must be a positive integer.');
  }
}
