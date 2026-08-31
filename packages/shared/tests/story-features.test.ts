import { describe, expect, it } from 'vitest';

import {
  extractStoryFeatures,
  tokenizeStoryTitle,
  type StoryFeatureArticle,
} from '../src/index.js';

describe('story feature extraction', () => {
  it('extracts deterministic story features', () => {
    const article: StoryFeatureArticle = {
      id: 'article-1',
      title: 'Northstar AI Launches Atlas One',
      publishedAt: new Date('2026-08-31T10:00:00.000Z'),
      publisherName: 'Global Wire',
    };

    expect(extractStoryFeatures(article)).toEqual({
      articleId: 'article-1',
      title: 'Northstar AI Launches Atlas One',
      normalizedTitle: 'northstar ai launches atlas one',
      titleTokens: ['northstar', 'ai', 'launches', 'atlas', 'one'],
      publishedAt: new Date('2026-08-31T10:00:00.000Z'),
      publisherName: 'Global Wire',
    });
  });

  it('reuses Phase 1 whitespace normalization before lexical preparation', () => {
    const features = extractStoryFeatures({
      id: ' article-1 ',
      title: '  Northstar   AI\nLaunches   Atlas One  ',
      publishedAt: null,
      publisherName: '  Global   Wire  ',
    });

    expect(features.articleId).toBe('article-1');

    expect(features.title).toBe('Northstar AI Launches Atlas One');

    expect(features.normalizedTitle).toBe('northstar ai launches atlas one');

    expect(features.publisherName).toBe('Global Wire');
  });

  it('normalizes title casing deterministically', () => {
    const first = extractStoryFeatures({
      id: 'article-1',
      title: 'OpenAI Launches Model X',
      publishedAt: null,
      publisherName: null,
    });

    const second = extractStoryFeatures({
      id: 'article-2',
      title: 'OPENAI LAUNCHES MODEL X',
      publishedAt: null,
      publisherName: null,
    });

    expect(first.normalizedTitle).toBe('openai launches model x');

    expect(second.normalizedTitle).toBe('openai launches model x');

    expect(first.titleTokens).toEqual(second.titleTokens);
  });

  it('uses punctuation as token boundaries without removing it from normalizedTitle', () => {
    const features = extractStoryFeatures({
      id: 'article-1',
      title: 'Northstar AI: Atlas One launches!',
      publishedAt: null,
      publisherName: null,
    });

    expect(features.normalizedTitle).toBe('northstar ai: atlas one launches!');

    expect(features.titleTokens).toEqual(['northstar', 'ai', 'atlas', 'one', 'launches']);
  });

  it('preserves ordered duplicate tokens', () => {
    const features = extractStoryFeatures({
      id: 'article-1',
      title: 'AI platform AI launch',
      publishedAt: null,
      publisherName: null,
    });

    expect(features.titleTokens).toEqual(['ai', 'platform', 'ai', 'launch']);
  });

  it('preserves semantically meaningful negation tokens', () => {
    const features = extractStoryFeatures({
      id: 'article-1',
      title: 'Northstar does not launch Atlas One',
      publishedAt: null,
      publisherName: null,
    });

    expect(features.titleTokens).toContain('not');

    expect(features.titleTokens).toEqual(['northstar', 'does', 'not', 'launch', 'atlas', 'one']);
  });

  it('keeps apostrophes inside lexical tokens', () => {
    expect(tokenizeStoryTitle("northstar doesn't launch atlas one")).toEqual([
      'northstar',
      "doesn't",
      'launch',
      'atlas',
      'one',
    ]);
  });

  it('supports Unicode lexical tokens', () => {
    expect(tokenizeStoryTitle('café launches modèle 3')).toEqual([
      'café',
      'launches',
      'modèle',
      '3',
    ]);
  });

  it('preserves null publication time and publisher', () => {
    const features = extractStoryFeatures({
      id: 'article-1',
      title: 'Example headline',
      publishedAt: null,
      publisherName: null,
    });

    expect(features.publishedAt).toBeNull();
    expect(features.publisherName).toBeNull();
  });

  it('normalizes a blank publisher name to null', () => {
    const features = extractStoryFeatures({
      id: 'article-1',
      title: 'Example headline',
      publishedAt: null,
      publisherName: '   ',
    });

    expect(features.publisherName).toBeNull();
  });

  it('rejects a blank article id', () => {
    expect(() =>
      extractStoryFeatures({
        id: '   ',
        title: 'Valid headline',
        publishedAt: null,
        publisherName: null,
      }),
    ).toThrow('Story feature article id must be a non-empty string.');
  });

  it('rejects a blank article title', () => {
    expect(() =>
      extractStoryFeatures({
        id: 'article-1',
        title: '   ',
        publishedAt: null,
        publisherName: null,
      }),
    ).toThrow('Story feature article title must be a non-empty string.');
  });

  it('rejects an invalid publication timestamp', () => {
    expect(() =>
      extractStoryFeatures({
        id: 'article-1',
        title: 'Valid headline',
        publishedAt: new Date(Number.NaN),
        publisherName: null,
      }),
    ).toThrow('Story feature article publishedAt must be a valid Date when present.');
  });

  it('does not mutate the input article', () => {
    const publishedAt = new Date('2026-08-31T10:00:00.000Z');

    const article: StoryFeatureArticle = {
      id: ' article-1 ',
      title: '  Example   Headline ',
      publishedAt,
      publisherName: ' Example Publisher ',
    };

    extractStoryFeatures(article);

    expect(article).toEqual({
      id: ' article-1 ',
      title: '  Example   Headline ',
      publishedAt,
      publisherName: ' Example Publisher ',
    });
  });

  it('does not share the mutable publishedAt instance with the input', () => {
    const publishedAt = new Date('2026-08-31T10:00:00.000Z');

    const features = extractStoryFeatures({
      id: 'article-1',
      title: 'Example headline',
      publishedAt,
      publisherName: null,
    });

    expect(features.publishedAt).not.toBe(publishedAt);

    expect(features.publishedAt?.getTime()).toBe(publishedAt.getTime());
  });

  it('returns identical lexical features across repeated extraction', () => {
    const article: StoryFeatureArticle = {
      id: 'article-1',
      title: 'Northstar AI launches Atlas One',
      publishedAt: new Date('2026-08-31T10:00:00.000Z'),
      publisherName: 'Global Wire',
    };

    const first = extractStoryFeatures(article);
    const second = extractStoryFeatures(article);

    expect(first).toEqual(second);
  });
});
