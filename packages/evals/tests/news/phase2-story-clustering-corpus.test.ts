import { describe, expect, it } from 'vitest';

import {
  phase2StoryClusteringBaseline,
  validateStoryClusteringEvaluationCorpus,
  type StoryClusteringEvaluationTag,
} from '../../src/news/index.js';

describe('Phase 2 story clustering evaluation corpus', () => {
  it('uses the stable Phase 2 corpus id', () => {
    expect(phase2StoryClusteringBaseline.id).toBe('phase2-story-clustering-v1');
  });

  it('passes structural validation', () => {
    expect(() =>
      validateStoryClusteringEvaluationCorpus(phase2StoryClusteringBaseline),
    ).not.toThrow();
  });

  it('covers the required clustering behaviors', () => {
    const tags = new Set<StoryClusteringEvaluationTag>();

    for (const scenario of phase2StoryClusteringBaseline.scenarios) {
      for (const tag of scenario.tags) {
        tags.add(tag);
      }
    }

    expect(tags).toEqual(
      new Set<StoryClusteringEvaluationTag>([
        'clear-same-story',
        'clear-different-story',
        'headline-variation',
        'publisher-independent',
        'time-variation',
        'same-entity-different-event',
        'same-keywords-different-event',
        'difficult-boundary',
        'multi-article',
        'transitive-bridge',
        'ordering-stability',
        'incremental-replay',
      ]),
    );
  });

  it('contains both multi-article and singleton expected clusters', () => {
    const clusters = phase2StoryClusteringBaseline.scenarios.flatMap(
      (scenario) => scenario.expectedClusters,
    );

    expect(clusters.some((cluster) => cluster.articleIds.length > 1)).toBe(true);

    expect(clusters.some((cluster) => cluster.articleIds.length === 1)).toBe(true);
  });

  it('contains an explicit transitive bridge scenario', () => {
    const scenario = phase2StoryClusteringBaseline.scenarios.find(
      (item) => item.id === 'transitive-bridge-protection',
    );

    expect(scenario).toBeDefined();

    expect(scenario?.expectedClusters).toEqual([
      {
        clusterId: 'aster-release',
        articleIds: ['bridge-a', 'bridge-b'],
      },
      {
        clusterId: 'contoso-integration',
        articleIds: ['bridge-c'],
      },
    ]);
  });

  it('contains multiple processing orders for stability evaluation', () => {
    const scenario = phase2StoryClusteringBaseline.scenarios.find(
      (item) => item.id === 'ordering-stability',
    );

    expect(scenario?.processingSequences).toHaveLength(3);
  });

  it('contains an intentional replay in the incremental scenario', () => {
    const scenario = phase2StoryClusteringBaseline.scenarios.find(
      (item) => item.id === 'incremental-replay',
    );

    const sequence = scenario?.processingSequences?.[0];

    expect(sequence?.articleIds).toEqual([
      'incremental-a',
      'incremental-b',
      'incremental-b',
      'incremental-c',
    ]);
  });
});

describe('story clustering corpus validation', () => {
  it('rejects an article assigned to multiple expected clusters', () => {
    expect(() =>
      validateStoryClusteringEvaluationCorpus({
        id: 'invalid-overlap',
        description: 'Invalid overlapping membership.',
        scenarios: [
          {
            id: 'scenario',
            description: 'Invalid scenario.',
            tags: ['clear-different-story'],
            articles: [
              {
                id: 'article-1',
                title: 'Example',
                canonicalUrl: 'https://example.com/1',
                publisherName: null,
                publishedAt: null,
              },
            ],
            expectedClusters: [
              {
                clusterId: 'cluster-a',
                articleIds: ['article-1'],
              },
              {
                clusterId: 'cluster-b',
                articleIds: ['article-1'],
              },
            ],
          },
        ],
      }),
    ).toThrow('Article article-1 appears in more than one expected cluster in scenario scenario.');
  });

  it('rejects expected cluster references to unknown articles', () => {
    expect(() =>
      validateStoryClusteringEvaluationCorpus({
        id: 'invalid-reference',
        description: 'Invalid article reference.',
        scenarios: [
          {
            id: 'scenario',
            description: 'Invalid scenario.',
            tags: ['clear-same-story'],
            articles: [
              {
                id: 'article-1',
                title: 'Example',
                canonicalUrl: 'https://example.com/1',
                publisherName: null,
                publishedAt: null,
              },
            ],
            expectedClusters: [
              {
                clusterId: 'cluster-a',
                articleIds: ['article-2'],
              },
            ],
          },
        ],
      }),
    ).toThrow(
      'Expected cluster cluster-a in scenario scenario references unknown article article-2.',
    );
  });

  it('rejects duplicate canonical article identities inside one scenario', () => {
    expect(() =>
      validateStoryClusteringEvaluationCorpus({
        id: 'invalid-canonical-url',
        description: 'Invalid canonical article duplication.',
        scenarios: [
          {
            id: 'scenario',
            description: 'Invalid scenario.',
            tags: ['clear-same-story'],
            articles: [
              {
                id: 'article-1',
                title: 'First',
                canonicalUrl: 'https://example.com/story',
                publisherName: null,
                publishedAt: null,
              },
              {
                id: 'article-2',
                title: 'Second',
                canonicalUrl: 'https://example.com/story',
                publisherName: null,
                publishedAt: null,
              },
            ],
            expectedClusters: [
              {
                clusterId: 'cluster-a',
                articleIds: ['article-1', 'article-2'],
              },
            ],
          },
        ],
      }),
    ).toThrow(
      'Duplicate canonicalUrl https://example.com/story in story clustering scenario scenario.',
    );
  });

  it('rejects processing sequences that never process every scenario article', () => {
    expect(() =>
      validateStoryClusteringEvaluationCorpus({
        id: 'invalid-processing-sequence',
        description: 'Invalid processing sequence.',
        scenarios: [
          {
            id: 'scenario',
            description: 'Invalid scenario.',
            tags: ['ordering-stability'],
            articles: [
              {
                id: 'article-1',
                title: 'First',
                canonicalUrl: 'https://example.com/1',
                publisherName: null,
                publishedAt: null,
              },
              {
                id: 'article-2',
                title: 'Second',
                canonicalUrl: 'https://example.com/2',
                publisherName: null,
                publishedAt: null,
              },
            ],
            expectedClusters: [
              {
                clusterId: 'cluster-a',
                articleIds: ['article-1'],
              },
              {
                clusterId: 'cluster-b',
                articleIds: ['article-2'],
              },
            ],
            processingSequences: [
              {
                id: 'incomplete',
                articleIds: ['article-1'],
              },
            ],
          },
        ],
      }),
    ).toThrow(
      'Processing sequence incomplete in scenario scenario never processes article article-2.',
    );
  });
});
