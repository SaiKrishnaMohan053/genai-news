import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import { RssSource } from '../src/index.js';

function fixtureUrl(name: string): URL {
  return new URL(`./fixtures/rss/${name}`, import.meta.url);
}

async function loadFixture(name: string): Promise<string> {
  return readFile(fixtureUrl(name), 'utf8');
}

describe('RssSource', () => {
  it('maps RSS 2.0 items into SourceArticle values', async () => {
    const xml = await loadFixture('rss-2.xml');

    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return new Response(xml, {
        status: 200,
        headers: {
          'Content-Type': 'application/rss+xml',
        },
      });
    });

    const source = new RssSource({
      id: 'example-rss',
      name: 'Example RSS',
      feedUrl: 'https://example.com/rss.xml',
      fetchImpl,
    });

    const result = await source.fetchLatest({
      limit: 10,
    });

    expect(result.source).toEqual({
      id: 'example-rss',
      name: 'Example RSS',
      type: 'rss',
    });

    expect(result.articles).toHaveLength(2);

    expect(result.articles[0]).toEqual({
      externalId: 'rss-article-1',
      title: 'First RSS headline',
      url: 'https://example.com/articles/1',
      publishedAt: 'Mon, 24 Aug 2026 15:00:00 GMT',
      author: 'RSS Author',
      summary: 'First RSS summary',
      category: 'Technology',
      publisher: {
        name: 'Example News',
      },
      metadata: {
        feedFormat: 'rss',
      },
    });
  });

  it('maps Atom entries into SourceArticle values', async () => {
    const xml = await loadFixture('atom.xml');

    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return new Response(xml);
    });

    const source = new RssSource({
      id: 'example-atom',
      name: 'Example Atom',
      feedUrl: 'https://example.org/atom.xml',
      fetchImpl,
    });

    const result = await source.fetchLatest({
      limit: 10,
    });

    expect(result.articles).toHaveLength(2);

    expect(result.articles[0]).toEqual({
      externalId: 'atom-article-1',
      title: 'First Atom headline',
      url: 'https://example.org/articles/1',
      publishedAt: '2026-08-24T14:00:00Z',
      author: 'Atom Author',
      summary: 'First Atom summary',
      category: 'World',
      publisher: {
        name: 'Example Atom News',
      },
      metadata: {
        feedFormat: 'atom',
      },
    });
  });

  it('uses Atom updated timestamp when published is absent', async () => {
    const xml = await loadFixture('atom.xml');

    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return new Response(xml);
    });

    const source = new RssSource({
      id: 'example-atom',
      name: 'Example Atom',
      feedUrl: 'https://example.org/atom.xml',
      fetchImpl,
    });

    const result = await source.fetchLatest({
      limit: 10,
    });

    expect(result.articles[1]?.publishedAt).toBe('2026-08-24T13:00:00Z');
  });

  it('allows RSS items with missing optional fields', async () => {
    const xml = await loadFixture('rss-2.xml');

    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return new Response(xml);
    });

    const source = new RssSource({
      id: 'example-rss',
      name: 'Example RSS',
      feedUrl: 'https://example.com/rss.xml',
      fetchImpl,
    });

    const result = await source.fetchLatest({
      limit: 10,
    });

    expect(result.articles[1]).toEqual({
      externalId: 'rss-article-2',
      title: 'Second RSS headline',
      url: 'https://example.com/articles/2',
      publisher: {
        name: 'Example News',
      },
      metadata: {
        feedFormat: 'rss',
      },
    });
  });

  it('uses an explicitly configured publisher', async () => {
    const xml = await loadFixture('rss-2.xml');

    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return new Response(xml);
    });

    const source = new RssSource({
      id: 'example-rss',
      name: 'Example RSS',
      feedUrl: 'https://example.com/rss.xml',
      publisher: {
        id: 'publisher-1',
        name: 'Configured Publisher',
      },
      fetchImpl,
    });

    const result = await source.fetchLatest({
      limit: 1,
    });

    expect(result.articles[0]?.publisher).toEqual({
      id: 'publisher-1',
      name: 'Configured Publisher',
    });
  });

  it('respects the requested limit', async () => {
    const xml = await loadFixture('rss-2.xml');

    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return new Response(xml);
    });

    const source = new RssSource({
      id: 'example-rss',
      name: 'Example RSS',
      feedUrl: 'https://example.com/rss.xml',
      fetchImpl,
    });

    const result = await source.fetchLatest({
      limit: 1,
    });

    expect(result.articles).toHaveLength(1);
  });

  it('rejects malformed XML', async () => {
    const xml = await loadFixture('malformed.xml');

    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return new Response(xml);
    });

    const source = new RssSource({
      id: 'example-rss',
      name: 'Example RSS',
      feedUrl: 'https://example.com/rss.xml',
      fetchImpl,
    });

    await expect(
      source.fetchLatest({
        limit: 10,
      }),
    ).rejects.toMatchObject({
      name: 'RssError',
      kind: 'invalid-xml',
    });
  });

  it('rejects valid XML that is not RSS or Atom', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return new Response('<document><item /></document>');
    });

    const source = new RssSource({
      id: 'example-rss',
      name: 'Example RSS',
      feedUrl: 'https://example.com/rss.xml',
      fetchImpl,
    });

    await expect(
      source.fetchLatest({
        limit: 10,
      }),
    ).rejects.toMatchObject({
      name: 'RssError',
      kind: 'invalid-feed',
    });
  });

  it('surfaces HTTP failures', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return new Response(null, {
        status: 500,
      });
    });

    const source = new RssSource({
      id: 'example-rss',
      name: 'Example RSS',
      feedUrl: 'https://example.com/rss.xml',
      fetchImpl,
    });

    await expect(
      source.fetchLatest({
        limit: 10,
      }),
    ).rejects.toMatchObject({
      name: 'RssError',
      kind: 'http',
      statusCode: 500,
    });
  });

  it('surfaces network failures', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new TypeError('network failure');
    });

    const source = new RssSource({
      id: 'example-rss',
      name: 'Example RSS',
      feedUrl: 'https://example.com/rss.xml',
      fetchImpl,
    });

    await expect(
      source.fetchLatest({
        limit: 10,
      }),
    ).rejects.toMatchObject({
      name: 'RssError',
      kind: 'network',
    });
  });

  it('rejects a non-positive limit', async () => {
    const source = new RssSource({
      id: 'example-rss',
      name: 'Example RSS',
      feedUrl: 'https://example.com/rss.xml',
    });

    await expect(
      source.fetchLatest({
        limit: 0,
      }),
    ).rejects.toThrow('RSS fetch limit must be a positive integer.');
  });

  it('rejects an invalid feed URL', () => {
    expect(
      () =>
        new RssSource({
          id: 'example-rss',
          name: 'Example RSS',
          feedUrl: 'not-a-url',
        }),
    ).toThrow('RSS feed URL must be a valid URL.');
  });

  it('rejects feed URLs with unsupported protocols', () => {
    expect(
      () =>
        new RssSource({
          id: 'example-rss',
          name: 'Example RSS',
          feedUrl: 'file:///tmp/feed.xml',
        }),
    ).toThrow('RSS feed URL must use HTTP or HTTPS.');
  });

  it('rejects feed URLs containing credentials', () => {
    expect(
      () =>
        new RssSource({
          id: 'example-rss',
          name: 'Example RSS',
          feedUrl: 'https://user:password@example.com/rss.xml',
        }),
    ).toThrow('RSS feed URL must not contain credentials.');
  });
});
