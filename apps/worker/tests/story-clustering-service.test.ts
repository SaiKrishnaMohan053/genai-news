import { createMetricsRegistry, createStoryClusteringMetrics } from '@genai-news/observability';

import {
  INITIAL_STORY_CLUSTERING_VERSION,
  type StoryArticleId,
  type StoryId,
} from '@genai-news/shared';

import { describe, expect, it, vi } from 'vitest';

import {
  createStoryClusteringService,
  type StoryClusteringDependencies,
} from '../src/news/story-clustering/index.js';

function articleId(value: string): StoryArticleId {
  return value as StoryArticleId;
}

function storyId(value: string): StoryId {
  return value as StoryId;
}

function createTestLogger() {
  return {
    info: vi.fn(),

    warn: vi.fn(),

    error: vi.fn(),
  };
}

function createDependencies(): StoryClusteringDependencies {
  return {
    articleReader: {
      findById: vi.fn(async (id) => ({
        id,

        title: 'Company launches AI platform',

        publishedAt: new Date('2026-09-01T10:00:00.000Z'),
      })),
    },

    membershipReader: {
      findByArticleId: vi.fn(async () => null),
    },

    candidateProvider: {
      findCandidates: vi.fn(async () => []),
    },

    semanticSimilarity: {
      compareAgainstCandidates: vi.fn(async (_incomingTitle, candidates) =>
        candidates.map((candidate) => ({
          articleId: candidate.articleId,

          similarity: 0.5,
        })),
      ),
    },

    persistence: {
      createSeedStory: vi.fn(async (input) => ({
        story: {
          id: input.storyId,
        },

        created: true,
      })),

      addMatchedMembership: vi.fn(async (input) => ({
        story: {
          id: input.storyId,
        },

        created: true,
      })),
    },

    storyIdFactory: {
      createStoryId: vi.fn(() => storyId('story-generated')),
    },
  };
}

describe('incremental story clustering service', () => {
  it('returns existing membership without recomputing clustering', async () => {
    const dependencies = createDependencies();

    vi.mocked(dependencies.membershipReader.findByArticleId).mockResolvedValue({
      storyId: storyId('story-existing'),

      articleId: articleId('article-a'),
    });

    const service = createStoryClusteringService(dependencies);

    const result = await service.clusterArticle(articleId('article-a'));

    expect(result).toEqual({
      kind: 'already-assigned',

      articleId: 'article-a',

      storyId: 'story-existing',
    });

    expect(dependencies.articleReader.findById).not.toHaveBeenCalled();

    expect(dependencies.candidateProvider.findCandidates).not.toHaveBeenCalled();

    expect(dependencies.semanticSimilarity.compareAgainstCandidates).not.toHaveBeenCalled();
  });

  it('seeds a new story when there are no candidates', async () => {
    const dependencies = createDependencies();

    const service = createStoryClusteringService(dependencies);

    const result = await service.clusterArticle(articleId('article-a'));

    expect(result).toEqual({
      kind: 'seeded-new-story',

      articleId: 'article-a',

      storyId: 'story-generated',

      reason: 'no-candidates',

      persisted: true,
    });

    expect(dependencies.semanticSimilarity.compareAgainstCandidates).not.toHaveBeenCalled();

    expect(dependencies.persistence.createSeedStory).toHaveBeenCalledWith({
      storyId: 'story-generated',

      seedArticleId: 'article-a',

      canonicalTitle: 'Company launches AI platform',

      clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
    });
  });

  it('records clustering metrics for an existing-story assignment', async () => {
    const registry = createMetricsRegistry({
      service: 'worker',

      environment: 'test',

      collectDefaults: false,
    });

    const metrics = createStoryClusteringMetrics(registry);

    const service = createStoryClusteringService({
      articleReader: {
        async findById() {
          return {
            id: articleId('article-new'),

            title: 'Example matching story',

            publishedAt: new Date('2026-09-05T12:00:00.000Z'),
          };
        },
      },

      membershipReader: {
        async findByArticleId() {
          return null;
        },
      },

      candidateProvider: {
        async findCandidates() {
          return [
            {
              storyId: storyId('story-existing'),

              representativeArticle: {
                id: articleId('article-representative'),

                title: 'Example matching story',

                publishedAt: new Date('2026-09-05T11:55:00.000Z'),
              },
            },
          ];
        },
      },

      semanticSimilarity: {
        async compareAgainstCandidates() {
          return [
            {
              articleId: articleId('article-representative'),

              similarity: 0.95,
            },
          ];
        },
      },

      persistence: {
        async addMatchedMembership() {
          return {
            story: {
              id: 'story-existing',
            },

            created: true,
          };
        },

        async createSeedStory() {
          throw new Error('unexpected seed');
        },
      },

      storyIdFactory: {
        createStoryId() {
          return storyId('unused-story-id');
        },
      },

      metrics,
    });

    await service.clusterArticle(articleId('article-new'));

    const output = await registry.metrics();

    expect(output).toContain('outcome="assigned_existing_story"');

    expect(output).toContain(
      'genai_news_story_candidates_total{service="worker",environment="test"} 1',
    );

    expect(output).toContain(
      'genai_news_story_semantic_comparisons_total{service="worker",environment="test"} 1',
    );
  });

  it('assigns to the only semantic match', async () => {
    const dependencies = createDependencies();

    vi.mocked(dependencies.candidateProvider.findCandidates).mockResolvedValue([
      {
        storyId: storyId('story-a'),

        representativeArticle: {
          id: articleId('rep-a'),

          title: 'Company reports quarterly earnings',

          publishedAt: new Date('2026-09-01T09:00:00.000Z'),
        },
      },

      {
        storyId: storyId('story-b'),

        representativeArticle: {
          id: articleId('rep-b'),

          title: 'Company unveils new AI platform',

          publishedAt: new Date('2026-09-01T09:30:00.000Z'),
        },
      },
    ]);

    vi.mocked(dependencies.semanticSimilarity.compareAgainstCandidates).mockResolvedValue([
      {
        articleId: articleId('rep-a'),

        similarity: 0.61,
      },

      {
        articleId: articleId('rep-b'),

        similarity: 0.84,
      },
    ]);

    const service = createStoryClusteringService(dependencies);

    const result = await service.clusterArticle(articleId('article-a'));

    expect(result).toEqual({
      kind: 'assigned-existing-story',

      articleId: 'article-a',

      storyId: 'story-b',

      representativeArticleId: 'rep-b',

      semanticSimilarity: 0.84,

      persisted: true,
    });

    expect(dependencies.persistence.addMatchedMembership).toHaveBeenCalledWith({
      storyId: 'story-b',

      articleId: 'article-a',

      representativeArticleId: 'rep-b',

      matchDecision: {
        decision: 'match',

        score: 0.84,

        signals: {
          semanticSimilarity: 0.84,
        },

        reason: 'semantic-similarity-at-or-above-v1-threshold',

        clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
      },
    });

    expect(dependencies.persistence.createSeedStory).not.toHaveBeenCalled();
  });

  it('seeds a new story when candidates exist but none match', async () => {
    const dependencies = createDependencies();

    vi.mocked(dependencies.candidateProvider.findCandidates).mockResolvedValue([
      {
        storyId: storyId('story-a'),

        representativeArticle: {
          id: articleId('rep-a'),

          title: 'Different event A',

          publishedAt: null,
        },
      },

      {
        storyId: storyId('story-b'),

        representativeArticle: {
          id: articleId('rep-b'),

          title: 'Different event B',

          publishedAt: null,
        },
      },
    ]);

    vi.mocked(dependencies.semanticSimilarity.compareAgainstCandidates).mockResolvedValue([
      {
        articleId: articleId('rep-a'),

        similarity: 0.62,
      },

      {
        articleId: articleId('rep-b'),

        similarity: 0.67,
      },
    ]);

    const service = createStoryClusteringService(dependencies);

    const result = await service.clusterArticle(articleId('article-a'));

    expect(result).toMatchObject({
      kind: 'seeded-new-story',

      storyId: 'story-generated',

      reason: 'no-matching-candidates',
    });
  });

  it('seeds conservatively when more than one story matches', async () => {
    const dependencies = createDependencies();

    vi.mocked(dependencies.candidateProvider.findCandidates).mockResolvedValue([
      {
        storyId: storyId('story-a'),

        representativeArticle: {
          id: articleId('rep-a'),

          title: 'Related event A',

          publishedAt: null,
        },
      },

      {
        storyId: storyId('story-b'),

        representativeArticle: {
          id: articleId('rep-b'),

          title: 'Related event B',

          publishedAt: null,
        },
      },
    ]);

    vi.mocked(dependencies.semanticSimilarity.compareAgainstCandidates).mockResolvedValue([
      {
        articleId: articleId('rep-a'),

        similarity: 0.82,
      },

      {
        articleId: articleId('rep-b'),

        similarity: 0.86,
      },
    ]);

    const service = createStoryClusteringService(dependencies);

    const result = await service.clusterArticle(articleId('article-a'));

    expect(result).toMatchObject({
      kind: 'seeded-new-story',

      reason: 'ambiguous-matching-candidates',

      storyId: 'story-generated',
    });

    expect(dependencies.persistence.addMatchedMembership).not.toHaveBeenCalled();
  });

  it('does not generate a story id when assigning an existing story', async () => {
    const dependencies = createDependencies();

    vi.mocked(dependencies.candidateProvider.findCandidates).mockResolvedValue([
      {
        storyId: storyId('story-a'),

        representativeArticle: {
          id: articleId('rep-a'),

          title: 'Company unveils AI platform',

          publishedAt: null,
        },
      },
    ]);

    vi.mocked(dependencies.semanticSimilarity.compareAgainstCandidates).mockResolvedValue([
      {
        articleId: articleId('rep-a'),

        similarity: 0.9,
      },
    ]);

    const service = createStoryClusteringService(dependencies);

    await service.clusterArticle(articleId('article-a'));

    expect(dependencies.storyIdFactory.createStoryId).not.toHaveBeenCalled();
  });

  it('throws when the target article does not exist', async () => {
    const dependencies = createDependencies();

    vi.mocked(dependencies.articleReader.findById).mockResolvedValue(null);

    const service = createStoryClusteringService(dependencies);

    await expect(service.clusterArticle(articleId('missing-article'))).rejects.toThrow(
      'Cannot cluster missing article: missing-article',
    );
  });

  it('rejects duplicate candidate story ids', async () => {
    const dependencies = createDependencies();

    vi.mocked(dependencies.candidateProvider.findCandidates).mockResolvedValue([
      {
        storyId: storyId('story-a'),

        representativeArticle: {
          id: articleId('rep-a'),

          title: 'Representative A',

          publishedAt: null,
        },
      },

      {
        storyId: storyId('story-a'),

        representativeArticle: {
          id: articleId('rep-b'),

          title: 'Representative B',

          publishedAt: null,
        },
      },
    ]);

    const service = createStoryClusteringService(dependencies);

    await expect(service.clusterArticle(articleId('article-a'))).rejects.toThrow(
      'Duplicate clustering candidate: story-a',
    );
  });

  it('performs one semantic batch comparison for all candidates', async () => {
    const dependencies = createDependencies();

    vi.mocked(dependencies.candidateProvider.findCandidates).mockResolvedValue([
      {
        storyId: storyId('story-a'),

        representativeArticle: {
          id: articleId('rep-a'),

          title: 'Candidate A',

          publishedAt: null,
        },
      },

      {
        storyId: storyId('story-b'),

        representativeArticle: {
          id: articleId('rep-b'),

          title: 'Candidate B',

          publishedAt: null,
        },
      },
    ]);

    vi.mocked(dependencies.semanticSimilarity.compareAgainstCandidates).mockResolvedValue([
      {
        articleId: articleId('rep-a'),

        similarity: 0.6,
      },

      {
        articleId: articleId('rep-b'),

        similarity: 0.61,
      },
    ]);

    const service = createStoryClusteringService(dependencies);

    await service.clusterArticle(articleId('article-a'));

    expect(dependencies.semanticSimilarity.compareAgainstCandidates).toHaveBeenCalledTimes(1);

    expect(dependencies.semanticSimilarity.compareAgainstCandidates).toHaveBeenCalledWith(
      'Company launches AI platform',

      [
        {
          articleId: 'rep-a',

          title: 'Candidate A',
        },

        {
          articleId: 'rep-b',

          title: 'Candidate B',
        },
      ],
    );
  });

  it('emits an already-assigned structured event', async () => {
    const dependencies = createDependencies();

    const logger = createTestLogger();

    dependencies.logger = logger;

    vi.mocked(dependencies.membershipReader.findByArticleId).mockResolvedValue({
      storyId: storyId('story-existing'),

      articleId: articleId('article-a'),
    });

    const service = createStoryClusteringService(dependencies);

    await service.clusterArticle(articleId('article-a'));

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'story.clustering.already_assigned',

        articleId: 'article-a',

        storyId: 'story-existing',
      }),

      'story.clustering.already_assigned',
    );

    expect(logger.warn).not.toHaveBeenCalled();

    expect(logger.error).not.toHaveBeenCalled();
  });

  it('emits an assigned-existing-story structured event', async () => {
    const dependencies = createDependencies();

    const logger = createTestLogger();

    dependencies.logger = logger;

    vi.mocked(dependencies.candidateProvider.findCandidates).mockResolvedValue([
      {
        storyId: storyId('story-existing'),

        representativeArticle: {
          id: articleId('article-representative'),

          title: 'Company unveils AI platform',

          publishedAt: new Date('2026-09-01T09:30:00.000Z'),
        },
      },
    ]);

    vi.mocked(dependencies.semanticSimilarity.compareAgainstCandidates).mockResolvedValue([
      {
        articleId: articleId('article-representative'),

        similarity: 0.95,
      },
    ]);

    const service = createStoryClusteringService(dependencies);

    await service.clusterArticle(articleId('article-a'));

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'story.clustering.assigned_existing_story',

        articleId: 'article-a',

        storyId: 'story-existing',

        representativeArticleId: 'article-representative',

        semanticSimilarity: 0.95,

        candidateCount: 1,

        persisted: true,

        clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
      }),

      'story.clustering.assigned_existing_story',
    );

    expect(logger.error).not.toHaveBeenCalled();
  });

  it('emits a seeded-new-story structured event', async () => {
    const dependencies = createDependencies();

    const logger = createTestLogger();

    dependencies.logger = logger;

    const service = createStoryClusteringService(dependencies);

    await service.clusterArticle(articleId('article-a'));

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'story.clustering.seeded_new_story',

        articleId: 'article-a',

        storyId: 'story-generated',

        reason: 'no-candidates',

        candidateCount: 0,

        persisted: true,

        clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
      }),

      'story.clustering.seeded_new_story',
    );

    expect(logger.error).not.toHaveBeenCalled();
  });

  it('emits a failed structured event and rethrows the error', async () => {
    const dependencies = createDependencies();

    const logger = createTestLogger();

    dependencies.logger = logger;

    const clusteringError = new Error('semantic provider unavailable');

    vi.mocked(dependencies.candidateProvider.findCandidates).mockResolvedValue([
      {
        storyId: storyId('story-existing'),

        representativeArticle: {
          id: articleId('article-representative'),

          title: 'Company unveils AI platform',

          publishedAt: null,
        },
      },
    ]);

    vi.mocked(dependencies.semanticSimilarity.compareAgainstCandidates).mockRejectedValue(
      clusteringError,
    );

    const service = createStoryClusteringService(dependencies);

    await expect(service.clusterArticle(articleId('article-a'))).rejects.toThrow(
      'semantic provider unavailable',
    );

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'story.clustering.failed',

        articleId: 'article-a',

        err: clusteringError,
      }),

      'story.clustering.failed',
    );
  });
});
