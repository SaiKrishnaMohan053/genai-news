import type { StoryClusteringEvaluationCorpus } from './contracts.js';

import type { StoryClusteringLabelledPair } from './pairwise-analysis.js';

import type {
  SemanticEmbeddingClient,
  SemanticEmbeddingRequest,
} from './semantic-embedding-client.js';

export type StorySemanticPair = {
  scenarioId: string;

  leftArticleId: string;
  rightArticleId: string;

  expectedSameStory: boolean;

  semanticCosineSimilarity: number;
};

export type StorySemanticNumericSummary = {
  count: number;

  min: number | null;
  mean: number | null;
  max: number | null;
};

export type StorySemanticSimilarityAnalysis = {
  pairs: readonly StorySemanticPair[];

  positivePairs: readonly StorySemanticPair[];

  negativePairs: readonly StorySemanticPair[];

  positiveSummary: StorySemanticNumericSummary;

  negativeSummary: StorySemanticNumericSummary;
};

export async function analyzeSemanticSimilarity(
  corpus: StoryClusteringEvaluationCorpus,
  labelledPairs: readonly StoryClusteringLabelledPair[],
  embeddingClient: SemanticEmbeddingClient,
): Promise<StorySemanticSimilarityAnalysis> {
  const requests = buildEmbeddingRequests(corpus);

  const embeddings = await embeddingClient.embed(requests);

  const embeddingByArticleId = new Map<string, readonly number[]>();

  for (const item of embeddings) {
    if (embeddingByArticleId.has(item.id)) {
      throw new Error(`Duplicate semantic embedding article id: ${item.id}`);
    }

    embeddingByArticleId.set(item.id, item.embedding);
  }

  const pairs = labelledPairs.map((pair) => {
    const left = embeddingByArticleId.get(pair.leftArticleId);

    const right = embeddingByArticleId.get(pair.rightArticleId);

    if (left === undefined || right === undefined) {
      throw new Error(
        `Missing semantic embedding for pair ${pair.leftArticleId} ↔ ${pair.rightArticleId}.`,
      );
    }

    return {
      scenarioId: pair.scenarioId,

      leftArticleId: pair.leftArticleId,

      rightArticleId: pair.rightArticleId,

      expectedSameStory: pair.expectedSameStory,

      semanticCosineSimilarity: calculateCosineSimilarity(left, right),
    };
  });

  const positivePairs = pairs.filter((pair) => pair.expectedSameStory);

  const negativePairs = pairs.filter((pair) => !pair.expectedSameStory);

  return {
    pairs,
    positivePairs,
    negativePairs,

    positiveSummary: summarize(positivePairs.map((pair) => pair.semanticCosineSimilarity)),

    negativeSummary: summarize(negativePairs.map((pair) => pair.semanticCosineSimilarity)),
  };
}

export function calculateCosineSimilarity(
  left: readonly number[],
  right: readonly number[],
): number {
  if (left.length === 0 || right.length === 0) {
    throw new Error('Cosine similarity requires non-empty vectors.');
  }

  if (left.length !== right.length) {
    throw new Error('Cosine similarity requires vectors with equal dimensions.');
  }

  let dotProduct = 0;
  let leftMagnitudeSquared = 0;
  let rightMagnitudeSquared = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index]!;

    const rightValue = right[index]!;

    dotProduct += leftValue * rightValue;

    leftMagnitudeSquared += leftValue * leftValue;

    rightMagnitudeSquared += rightValue * rightValue;
  }

  if (leftMagnitudeSquared === 0 || rightMagnitudeSquared === 0) {
    throw new Error('Cosine similarity cannot compare a zero vector.');
  }

  return dotProduct / (Math.sqrt(leftMagnitudeSquared) * Math.sqrt(rightMagnitudeSquared));
}

function buildEmbeddingRequests(
  corpus: StoryClusteringEvaluationCorpus,
): readonly SemanticEmbeddingRequest[] {
  const result: SemanticEmbeddingRequest[] = [];

  const observedIds = new Set<string>();

  for (const scenario of corpus.scenarios) {
    for (const article of scenario.articles) {
      if (observedIds.has(article.id)) {
        throw new Error(`Duplicate semantic evaluation article id: ${article.id}`);
      }

      observedIds.add(article.id);

      result.push({
        id: article.id,

        /**
         * Intentionally title-only.
         *
         * No publisher, date, scenario description,
         * expected cluster label, or prompt augmentation
         * is supplied to the embedding model.
         */
        text: article.title,
      });
    }
  }

  return result;
}

function summarize(values: readonly number[]): StorySemanticNumericSummary {
  if (values.length === 0) {
    return {
      count: 0,
      min: null,
      mean: null,
      max: null,
    };
  }

  return {
    count: values.length,

    min: Math.min(...values),

    mean: values.reduce((total, value) => total + value, 0) / values.length,

    max: Math.max(...values),
  };
}
