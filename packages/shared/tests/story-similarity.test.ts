import { describe, expect, it } from 'vitest';

import {
  calculatePublicationTimeDistanceMs,
  calculateTokenJaccardSimilarity,
  calculateTokenOrderSimilarity,
  compareStoryFeatures,
  extractStoryFeatures,
} from '../src/index.js';

function features(id: string, title: string, publishedAt: Date | null = null) {
  return extractStoryFeatures({
    id,
    title,
    publishedAt,
    publisherName: null,
  });
}

describe('story pairwise similarity signals', () => {
  it('returns perfect lexical signals for identical token sequences', () => {
    const result = compareStoryFeatures({
      left: features('article-a', 'Northstar AI launches Atlas One'),

      right: features('article-b', 'Northstar AI launches Atlas One'),
    });

    expect(result.signals).toEqual({
      titleTokenJaccard: 1,
      titleTokenOrderSimilarity: 1,
      publicationTimeDistanceMs: null,
    });
  });

  it('treats casing and punctuation variation consistently after feature extraction', () => {
    const result = compareStoryFeatures({
      left: features('article-a', 'Northstar AI launches Atlas One'),

      right: features('article-b', 'NORTHSTAR AI: launches Atlas One!'),
    });

    expect(result.signals.titleTokenJaccard).toBe(1);

    expect(result.signals.titleTokenOrderSimilarity).toBe(1);
  });

  it('calculates deterministic partial Jaccard overlap', () => {
    expect(
      calculateTokenJaccardSimilarity(
        ['northstar', 'launches', 'atlas'],
        ['northstar', 'reports', 'earnings'],
      ),
    ).toBeCloseTo(0.2);
  });

  it('returns zero Jaccard similarity when no tokens overlap', () => {
    expect(calculateTokenJaccardSimilarity(['northstar', 'atlas'], ['bluepeak', 'earnings'])).toBe(
      0,
    );
  });

  it('does not allow duplicate tokens to inflate Jaccard similarity', () => {
    expect(
      calculateTokenJaccardSimilarity(
        ['ai', 'ai', 'platform', 'launch'],
        ['ai', 'platform', 'launch'],
      ),
    ).toBe(1);
  });

  it('returns zero Jaccard similarity when either token set is empty', () => {
    expect(calculateTokenJaccardSimilarity([], ['ai'])).toBe(0);

    expect(calculateTokenJaccardSimilarity([], [])).toBe(0);
  });

  it('returns perfect order similarity for identical sequences', () => {
    expect(
      calculateTokenOrderSimilarity(
        ['northstar', 'launches', 'atlas'],
        ['northstar', 'launches', 'atlas'],
      ),
    ).toBe(1);
  });

  it('distinguishes reordered titles from identical ordered titles', () => {
    const jaccard = calculateTokenJaccardSimilarity(
      ['bluepeak', 'acquires', 'river', 'labs'],
      ['river', 'labs', 'acquires', 'bluepeak'],
    );

    const order = calculateTokenOrderSimilarity(
      ['bluepeak', 'acquires', 'river', 'labs'],
      ['river', 'labs', 'acquires', 'bluepeak'],
    );

    expect(jaccard).toBe(1);

    expect(order).toBeLessThan(1);

    expect(order).toBeGreaterThan(0);
  });

  it('normalizes token order similarity by the larger sequence', () => {
    expect(
      calculateTokenOrderSimilarity(
        ['helios', 'e7', 'electric', 'sedan'],
        ['helios', 'introduces', 'the', 'new', 'e7', 'electric', 'sedan'],
      ),
    ).toBeCloseTo(4 / 7);
  });

  it('returns zero order similarity when either token sequence is empty', () => {
    expect(calculateTokenOrderSimilarity([], ['ai'])).toBe(0);

    expect(calculateTokenOrderSimilarity([], [])).toBe(0);
  });

  it('preserves duplicate-token sequence information in order similarity', () => {
    const withDuplicate = calculateTokenOrderSimilarity(
      ['ai', 'platform', 'ai', 'launch'],
      ['ai', 'platform', 'launch'],
    );

    expect(withDuplicate).toBe(3 / 4);
  });

  it('calculates absolute publication-time distance', () => {
    const result = calculatePublicationTimeDistanceMs(
      new Date('2026-08-31T10:00:00.000Z'),
      new Date('2026-08-31T11:30:00.000Z'),
    );

    expect(result).toBe(90 * 60 * 1000);
  });

  it('publication-time distance is symmetric', () => {
    const earlier = new Date('2026-08-31T10:00:00.000Z');

    const later = new Date('2026-08-31T11:30:00.000Z');

    expect(calculatePublicationTimeDistanceMs(earlier, later)).toBe(
      calculatePublicationTimeDistanceMs(later, earlier),
    );
  });

  it('returns zero for identical publication timestamps', () => {
    const timestamp = new Date('2026-08-31T10:00:00.000Z');

    expect(calculatePublicationTimeDistanceMs(timestamp, new Date(timestamp.getTime()))).toBe(0);
  });

  it('returns null when publication time is unavailable', () => {
    expect(calculatePublicationTimeDistanceMs(null, new Date())).toBeNull();

    expect(calculatePublicationTimeDistanceMs(null, null)).toBeNull();
  });

  it('produces symmetric lexical signals', () => {
    const left = features('article-a', 'BluePeak agrees to acquire River Labs');

    const right = features('article-b', 'River Labs to be acquired by BluePeak');

    const forward = compareStoryFeatures({
      left,
      right,
    });

    const reverse = compareStoryFeatures({
      left: right,
      right: left,
    });

    expect(forward.signals.titleTokenJaccard).toBe(reverse.signals.titleTokenJaccard);

    expect(forward.signals.titleTokenOrderSimilarity).toBe(
      reverse.signals.titleTokenOrderSimilarity,
    );
  });

  it('preserves article identities in the comparison result', () => {
    const result = compareStoryFeatures({
      left: features('article-left', 'Example first headline'),

      right: features('article-right', 'Example second headline'),
    });

    expect(result.leftArticleId).toBe('article-left');

    expect(result.rightArticleId).toBe('article-right');
  });

  it('rejects comparison of the same persisted article identity', () => {
    expect(() =>
      compareStoryFeatures({
        left: features('article-1', 'First headline'),

        right: features('article-1', 'Second headline'),
      }),
    ).toThrow('Cannot compare story features for the same article id: article-1');
  });

  it('returns identical signals across repeated comparison', () => {
    const left = features(
      'article-a',
      'Northstar launches Atlas One',
      new Date('2026-08-31T10:00:00.000Z'),
    );

    const right = features(
      'article-b',
      'Atlas One launched by Northstar',
      new Date('2026-08-31T10:30:00.000Z'),
    );

    const first = compareStoryFeatures({
      left,
      right,
    });

    const second = compareStoryFeatures({
      left,
      right,
    });

    expect(first).toEqual(second);
  });
});
