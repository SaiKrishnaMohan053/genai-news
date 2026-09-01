import type { SemanticEmbeddingClient } from '@genai-news/tools';

import type { StoryArticleId } from '@genai-news/shared';

import { describe, expect, it, vi } from 'vitest';

import {
  calculateCosineSimilarity,
  createSemanticStorySimilarityProvider,
} from '../src/news/story-clustering/index.js';

function articleId(value: string): StoryArticleId {
  return value as StoryArticleId;
}

describe('semantic story similarity provider', () => {
  it('embeds the incoming title and all candidate titles in one request', async () => {
    const embed = vi.fn().mockResolvedValue([
      {
        id: 'incoming',

        embedding: [1, 0],
      },

      {
        id: 'candidate:rep-a',

        embedding: [0.8, 0.6],
      },

      {
        id: 'candidate:rep-b',

        embedding: [0, 1],
      },
    ]);

    const client = {
      embed,
    } satisfies SemanticEmbeddingClient;

    const provider = createSemanticStorySimilarityProvider(client);

    const result = await provider.compareAgainstCandidates(
      'Incoming title',

      [
        {
          articleId: articleId('rep-a'),

          title: 'Candidate A',
        },

        {
          articleId: articleId('rep-b'),

          title: 'Candidate B',
        },
      ],
    );

    expect(result).toEqual([
      {
        articleId: 'rep-a',

        similarity: 0.8,
      },

      {
        articleId: 'rep-b',

        similarity: 0,
      },
    ]);

    expect(embed).toHaveBeenCalledTimes(1);

    expect(embed).toHaveBeenCalledWith([
      {
        id: 'incoming',

        text: 'Incoming title',
      },

      {
        id: 'candidate:rep-a',

        text: 'Candidate A',
      },

      {
        id: 'candidate:rep-b',

        text: 'Candidate B',
      },
    ]);
  });

  it('does not call embedding client when there are no candidates', async () => {
    const embed = vi.fn();

    const client = {
      embed,
    } satisfies SemanticEmbeddingClient;

    const provider = createSemanticStorySimilarityProvider(client);

    await expect(provider.compareAgainstCandidates('Incoming title', [])).resolves.toEqual([]);

    expect(embed).not.toHaveBeenCalled();
  });

  it('rejects duplicate candidate article ids', async () => {
    const client = {
      embed: vi.fn(),
    } satisfies SemanticEmbeddingClient;

    const provider = createSemanticStorySimilarityProvider(client);

    await expect(
      provider.compareAgainstCandidates(
        'Incoming title',

        [
          {
            articleId: articleId('rep-a'),

            title: 'Candidate A',
          },

          {
            articleId: articleId('rep-a'),

            title: 'Candidate B',
          },
        ],
      ),
    ).rejects.toThrow('Duplicate semantic candidate article id: rep-a');
  });

  it('rejects a missing candidate embedding', async () => {
    const client = {
      embed: vi.fn().mockResolvedValue([
        {
          id: 'incoming',

          embedding: [1, 0],
        },
      ]),
    } satisfies SemanticEmbeddingClient;

    const provider = createSemanticStorySimilarityProvider(client);

    await expect(
      provider.compareAgainstCandidates(
        'Incoming title',

        [
          {
            articleId: articleId('rep-a'),

            title: 'Candidate A',
          },
        ],
      ),
    ).rejects.toThrow('Semantic comparison is missing candidate embedding: rep-a');
  });

  it('rejects zero vectors', () => {
    expect(() => calculateCosineSimilarity([0, 0], [1, 0])).toThrow(
      'Cosine similarity cannot compare a zero vector.',
    );
  });

  it('rejects different vector dimensions', () => {
    expect(() => calculateCosineSimilarity([1, 0], [1, 0, 0])).toThrow(
      'Cosine similarity requires vectors with equal dimensions.',
    );
  });
});
