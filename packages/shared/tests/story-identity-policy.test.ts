import { describe, expect, it } from 'vitest';

import {
  createStoryIdentityV1,
  decideCanonicalStoryTitleV1,
  decideStoryRepresentativeV1,
  INITIAL_STORY_CLUSTERING_VERSION,
  type StoryArticleId,
  type StoryId,
} from '../src/index.js';

function articleId(value: string): StoryArticleId {
  return value as StoryArticleId;
}

function storyId(value: string): StoryId {
  return value as StoryId;
}

describe('Phase 2 v1 canonical story identity policy', () => {
  it('creates a story identity from the seed article', () => {
    const identity = createStoryIdentityV1(
      storyId('story-1'),
      articleId('article-a'),
      'Company launches new platform',
    );

    expect(identity).toEqual({
      storyId: 'story-1',

      seedArticleId: 'article-a',

      representativeArticleId: 'article-a',

      canonicalTitle: 'Company launches new platform',

      clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
    });
  });

  it('keeps story identity separate from title metadata', () => {
    const identity = createStoryIdentityV1(
      storyId('story-stable'),
      articleId('article-a'),
      'Original headline',
    );

    const titleDecision = decideCanonicalStoryTitleV1(
      identity.canonicalTitle,
      'Different publisher headline',
    );

    expect(identity.storyId).toBe('story-stable');

    expect(titleDecision.canonicalTitle).toBe('Original headline');
  });

  it('freezes the seed article as representative', () => {
    const decision = decideStoryRepresentativeV1(
      articleId('article-seed'),
      articleId('article-new'),
    );

    expect(decision).toEqual({
      decision: 'keep-existing-representative',

      representativeArticleId: 'article-seed',

      incomingArticleId: 'article-new',

      reason: 'v1-seed-representative-is-stable',

      clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
    });
  });

  it('does not promote a higher-scoring or later article implicitly', () => {
    const first = decideStoryRepresentativeV1(articleId('article-seed'), articleId('article-b'));

    const second = decideStoryRepresentativeV1(
      first.representativeArticleId,
      articleId('article-c'),
    );

    expect(first.representativeArticleId).toBe('article-seed');

    expect(second.representativeArticleId).toBe('article-seed');
  });

  it('prevents representative drift across repeated memberships', () => {
    let representative = articleId('article-a');

    for (const incoming of ['article-b', 'article-c', 'article-d']) {
      const decision = decideStoryRepresentativeV1(representative, articleId(incoming));

      representative = decision.representativeArticleId;
    }

    expect(representative).toBe('article-a');
  });

  it('keeps the existing canonical title when another article joins', () => {
    const decision = decideCanonicalStoryTitleV1(
      'Company launches platform',
      'Platform unveiled by company at event',
    );

    expect(decision).toEqual({
      decision: 'keep-existing-canonical-title',

      canonicalTitle: 'Company launches platform',

      incomingTitle: 'Platform unveiled by company at event',

      reason: 'v1-canonical-title-is-not-automatically-rewritten',

      clusteringVersion: INITIAL_STORY_CLUSTERING_VERSION,
    });
  });

  it('does not choose a longer incoming title automatically', () => {
    const decision = decideCanonicalStoryTitleV1(
      'Company launches platform',
      'Company officially launches its new artificial intelligence platform worldwide',
    );

    expect(decision.canonicalTitle).toBe('Company launches platform');
  });

  it('rejects an empty story id', () => {
    expect(() => createStoryIdentityV1(storyId(''), articleId('article-a'), 'Valid title')).toThrow(
      'Story id must be non-empty.',
    );
  });

  it('rejects an empty seed article id', () => {
    expect(() => createStoryIdentityV1(storyId('story-a'), articleId(''), 'Valid title')).toThrow(
      'Seed article id must be non-empty.',
    );
  });

  it('rejects an unnormalized seed title', () => {
    expect(() =>
      createStoryIdentityV1(storyId('story-a'), articleId('article-a'), '  Valid title  '),
    ).toThrow('Seed title must already be normalized.');
  });

  it('rejects using the representative itself as an incoming membership', () => {
    expect(() =>
      decideStoryRepresentativeV1(articleId('article-a'), articleId('article-a')),
    ).toThrow('Incoming article cannot already be the story representative.');
  });

  it('returns deterministic metadata decisions', () => {
    const first = decideCanonicalStoryTitleV1('Original headline', 'Incoming headline');

    const second = decideCanonicalStoryTitleV1('Original headline', 'Incoming headline');

    expect(first).toEqual(second);
  });
});
