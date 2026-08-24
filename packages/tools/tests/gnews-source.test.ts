import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import { GNewsError, GNewsSource } from '../src/index.js';

const fixtureUrl = new URL('./fixtures/gnews/top-headlines.json', import.meta.url);

async function loadFixture(): Promise<unknown> {
  return JSON.parse(await readFile(fixtureUrl, 'utf8'));
}

describe('GNewsSource', () => {
  it('maps a valid GNews response into provider-neutral source articles', async () => {
    const fixture = await loadFixture();

    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return Response.json(fixture, {
        status: 200,
      });
    });

    const source = new GNewsSource({
      apiKey: 'test-api-key',
      fetchImpl,
    });

    const result = await source.fetchLatest({
      limit: 10,
    });

    expect(result.source).toEqual({
      id: 'gnews',
      name: 'GNews',
      type: 'api',
    });

    expect(result.fetchedAt).toBeInstanceOf(Date);
    expect(result.articles).toHaveLength(2);

    expect(result.articles[0]).toEqual({
      externalId: 'article-001',
      title: 'Example technology headline',
      url: 'https://example.com/news/article-001',
      publishedAt: '2026-08-24T15:00:00Z',
      summary: 'An example description for the first article.',
      publisher: {
        id: 'publisher-001',
        name: 'Example Publisher',
      },
      metadata: {
        description: 'An example description for the first article.',
        image: 'https://example.com/images/article-001.jpg',
        language: 'en',
        sourceUrl: 'https://example.com',
        sourceCountry: 'us',
      },
    });
  });

  it('sends the API key in a header rather than the URL', async () => {
    const fixture = await loadFixture();

    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return Response.json(fixture);
    });

    const source = new GNewsSource({
      apiKey: 'secret-api-key',
      fetchImpl,
    });

    await source.fetchLatest({
      limit: 5,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [url, init] = fetchImpl.mock.calls[0]!;

    expect(String(url)).not.toContain('secret-api-key');
    expect(String(url)).toContain('max=5');

    expect(init?.headers).toEqual({
      Accept: 'application/json',
      'X-Api-Key': 'secret-api-key',
    });
  });

  it('caps requested results at the provider maximum', async () => {
    const fixture = await loadFixture();

    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return Response.json(fixture);
    });

    const source = new GNewsSource({
      apiKey: 'test-api-key',
      fetchImpl,
    });

    await source.fetchLatest({
      limit: 500,
    });

    const [url] = fetchImpl.mock.calls[0]!;

    expect(String(url)).toContain('max=100');
  });

  it('rejects an empty API key', () => {
    expect(() => {
      new GNewsSource({
        apiKey: '   ',
      });
    }).toThrow('GNews API key must not be empty.');
  });

  it('rejects a non-positive fetch limit', async () => {
    const source = new GNewsSource({
      apiKey: 'test-api-key',
    });

    await expect(
      source.fetchLatest({
        limit: 0,
      }),
    ).rejects.toThrow('GNews fetch limit must be a positive integer.');
  });

  it('surfaces HTTP provider failures', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return new Response(null, {
        status: 429,
      });
    });

    const source = new GNewsSource({
      apiKey: 'test-api-key',
      fetchImpl,
    });

    await expect(
      source.fetchLatest({
        limit: 10,
      }),
    ).rejects.toMatchObject({
      name: 'GNewsError',
      kind: 'http',
      statusCode: 429,
    });
  });

  it('rejects invalid JSON', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return new Response('not-json', {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });

    const source = new GNewsSource({
      apiKey: 'test-api-key',
      fetchImpl,
    });

    await expect(
      source.fetchLatest({
        limit: 10,
      }),
    ).rejects.toMatchObject({
      name: 'GNewsError',
      kind: 'invalid-json',
    });
  });

  it('rejects provider schema drift', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return Response.json({
        totalArticles: 1,
        articles: [
          {
            unexpected: true,
          },
        ],
      });
    });

    const source = new GNewsSource({
      apiKey: 'test-api-key',
      fetchImpl,
    });

    await expect(
      source.fetchLatest({
        limit: 10,
      }),
    ).rejects.toMatchObject({
      name: 'GNewsError',
      kind: 'invalid-response',
    });
  });

  it('surfaces network failures', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new TypeError('network failure');
    });

    const source = new GNewsSource({
      apiKey: 'test-api-key',
      fetchImpl,
    });

    await expect(
      source.fetchLatest({
        limit: 10,
      }),
    ).rejects.toMatchObject({
      name: 'GNewsError',
      kind: 'network',
    });
  });

  it('does not include provider content in SourceArticle metadata', async () => {
    const fixture = await loadFixture();

    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return Response.json(fixture);
    });

    const source = new GNewsSource({
      apiKey: 'test-api-key',
      fetchImpl,
    });

    const result = await source.fetchLatest({
      limit: 10,
    });

    expect(result.articles[0]?.metadata).not.toHaveProperty('content');
  });

  it('allows provider articles with no description', async () => {
    const fixture = await loadFixture();

    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return Response.json(fixture);
    });

    const source = new GNewsSource({
      apiKey: 'test-api-key',
      fetchImpl,
    });

    const result = await source.fetchLatest({
      limit: 10,
    });

    expect(result.articles[1]?.summary).toBeUndefined();
  });
});
