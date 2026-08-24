import { describe, expect, it } from 'vitest';

import {
  newsSourceDescriptorSchema,
  newsSourceFetchInputSchema,
  sourceArticleSchema,
} from '../src/news/index.js';

describe('news source contracts', () => {
  it('accepts a valid API source descriptor', () => {
    const result = newsSourceDescriptorSchema.safeParse({
      id: 'example-api',
      name: 'Example API',
      type: 'api',
    });

    expect(result.success).toBe(true);
  });

  it('accepts a valid RSS source descriptor', () => {
    const result = newsSourceDescriptorSchema.safeParse({
      id: 'example-rss',
      name: 'Example RSS',
      type: 'rss',
    });

    expect(result.success).toBe(true);
  });

  it('rejects an unsupported source type', () => {
    const result = newsSourceDescriptorSchema.safeParse({
      id: 'example-search',
      name: 'Example Search',
      type: 'search',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an empty source id', () => {
    const result = newsSourceDescriptorSchema.safeParse({
      id: '',
      name: 'Example API',
      type: 'api',
    });

    expect(result.success).toBe(false);
  });

  it('accepts a minimal source article', () => {
    const result = sourceArticleSchema.safeParse({});

    expect(result.success).toBe(true);
  });

  it('accepts a complete source article', () => {
    const result = sourceArticleSchema.safeParse({
      externalId: 'article-123',
      title: 'Example article',
      url: 'https://example.com/article',
      publishedAt: '2026-08-24T12:00:00Z',
      author: 'Example Author',
      summary: 'Example summary',
      category: 'technology',
      publisher: {
        id: 'example-publisher',
        name: 'Example Publisher',
      },
      metadata: {
        providerField: 'value',
      },
    });

    expect(result.success).toBe(true);
  });

  it('accepts a malformed URL string for later normalization', () => {
    const result = sourceArticleSchema.safeParse({
      title: 'Example article',
      url: 'not-a-valid-url',
    });

    expect(result.success).toBe(true);
  });

  it('accepts an invalid timestamp string for later normalization', () => {
    const result = sourceArticleSchema.safeParse({
      title: 'Example article',
      publishedAt: 'not-a-timestamp',
    });

    expect(result.success).toBe(true);
  });

  it('accepts missing optional article fields', () => {
    const result = sourceArticleSchema.safeParse({
      title: 'Example article',
    });

    expect(result.success).toBe(true);
  });

  it('rejects a non-string title', () => {
    const result = sourceArticleSchema.safeParse({
      title: 123,
    });

    expect(result.success).toBe(false);
  });

  it('rejects malformed metadata', () => {
    const result = sourceArticleSchema.safeParse({
      metadata: 'not-an-object',
    });

    expect(result.success).toBe(false);
  });

  it('accepts a positive integer fetch limit', () => {
    const result = newsSourceFetchInputSchema.safeParse({
      limit: 20,
    });

    expect(result.success).toBe(true);
  });

  it('rejects a zero fetch limit', () => {
    const result = newsSourceFetchInputSchema.safeParse({
      limit: 0,
    });

    expect(result.success).toBe(false);
  });

  it('rejects a fractional fetch limit', () => {
    const result = newsSourceFetchInputSchema.safeParse({
      limit: 10.5,
    });

    expect(result.success).toBe(false);
  });
});
