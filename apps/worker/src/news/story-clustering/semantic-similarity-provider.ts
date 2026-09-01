import type { SemanticEmbeddingClient } from '@genai-news/tools';

import type { SemanticStorySimilarityProvider } from './story-clustering-service.js';

export function createSemanticStorySimilarityProvider(
  embeddingClient: SemanticEmbeddingClient,
): SemanticStorySimilarityProvider {
  return {
    async compareAgainstCandidates(incomingTitle, candidates) {
      validateTitle(incomingTitle, 'Incoming');

      if (candidates.length === 0) {
        return [];
      }

      const observedArticleIds = new Set<string>();

      for (const candidate of candidates) {
        if (candidate.articleId.trim().length === 0) {
          throw new Error('Semantic candidate article id must be non-empty.');
        }

        if (observedArticleIds.has(candidate.articleId)) {
          throw new Error(`Duplicate semantic candidate article id: ${candidate.articleId}`);
        }

        observedArticleIds.add(candidate.articleId);

        validateTitle(candidate.title, 'Candidate');
      }

      /**
       * One request:
       *
       * incoming title
       * + every candidate representative title
       */
      const embeddings = await embeddingClient.embed([
        {
          id: 'incoming',

          text: incomingTitle,
        },

        ...candidates.map((candidate) => ({
          id: candidateEmbeddingId(candidate.articleId),

          text: candidate.title,
        })),
      ]);

      const embeddingById = new Map(embeddings.map((item) => [item.id, item.embedding]));

      const incomingEmbedding = embeddingById.get('incoming');

      if (incomingEmbedding === undefined) {
        throw new Error('Semantic comparison is missing the incoming embedding.');
      }

      return candidates.map((candidate) => {
        const embedding = embeddingById.get(candidateEmbeddingId(candidate.articleId));

        if (embedding === undefined) {
          throw new Error(
            `Semantic comparison is missing candidate embedding: ${candidate.articleId}`,
          );
        }

        return {
          articleId: candidate.articleId,

          similarity: calculateCosineSimilarity(incomingEmbedding, embedding),
        };
      });
    },
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

function candidateEmbeddingId(articleId: string): string {
  return `candidate:${articleId}`;
}

function validateTitle(title: string, label: string): void {
  if (title.trim().length === 0) {
    throw new Error(`${label} semantic title must be non-empty.`);
  }

  if (title !== title.trim()) {
    throw new Error(`${label} semantic title must already be normalized.`);
  }
}
