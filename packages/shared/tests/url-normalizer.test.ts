import { describe, expect, it } from 'vitest';

import { normalizeArticleUrl } from '../src/news/index.js';

describe('normalizeArticleUrl', () => {
  it('accepts an HTTPS article URL', () => {
    expect(normalizeArticleUrl('https://example.com/story')).toEqual({
      url: 'https://example.com/story',
      canonicalUrl: 'https://example.com/story',
    });
  });

  it('normalizes hostname casing', () => {
    const result = normalizeArticleUrl('https://EXAMPLE.COM/story');

    expect(result?.canonicalUrl).toBe('https://example.com/story');
  });

  it('removes fragments', () => {
    const result = normalizeArticleUrl('https://example.com/story#section');

    expect(result).toEqual({
      url: 'https://example.com/story',
      canonicalUrl: 'https://example.com/story',
    });
  });

  it('removes UTM tracking parameters from canonical URL', () => {
    const result = normalizeArticleUrl(
      'https://example.com/story?id=42&utm_source=x&utm_campaign=test',
    );

    expect(result?.url).toContain('utm_source=x');
    expect(result?.canonicalUrl).toBe('https://example.com/story?id=42');
  });

  it('removes common click tracking parameters', () => {
    const result = normalizeArticleUrl('https://example.com/story?id=42&fbclid=abc&gclid=xyz');

    expect(result?.canonicalUrl).toBe('https://example.com/story?id=42');
  });

  it('keeps non-tracking query parameters', () => {
    const result = normalizeArticleUrl('https://example.com/story?id=42&page=2');

    expect(result?.canonicalUrl).toContain('id=42');
    expect(result?.canonicalUrl).toContain('page=2');
  });

  it('sorts canonical query parameters', () => {
    const result = normalizeArticleUrl('https://example.com/story?z=2&a=1');

    expect(result?.canonicalUrl).toBe('https://example.com/story?a=1&z=2');
  });

  it('rejects unsupported protocols', () => {
    expect(normalizeArticleUrl('javascript:alert(1)')).toBeNull();
  });

  it('rejects invalid URLs', () => {
    expect(normalizeArticleUrl('not-a-url')).toBeNull();
  });

  it('rejects URLs containing credentials', () => {
    expect(normalizeArticleUrl('https://user:password@example.com/story')).toBeNull();
  });
});
