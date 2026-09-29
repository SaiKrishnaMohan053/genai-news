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

describe('GNewsSource search', () => {
  it('searches GNews with a bounded focused query', async () => {
    const fixture = await loadFixture();

    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return Response.json(fixture);
    });

    const source = new GNewsSource({
      apiKey: 'test-api-key',
      fetchImpl,
    });

    const result = await source.search({
      query: 'OpenAI announcement',
      limit: 5,
    });

    expect(result.articles).toHaveLength(2);
    expect(result.totalArticles).toBe(2);
    expect(result.truncated).toBe(false);

    const [url, init] = fetchImpl.mock.calls[0]!;

    const requestUrl = new URL(String(url));

    expect(requestUrl.pathname).toBe('/api/v4/search');
    expect(requestUrl.searchParams.get('q')).toBe('OpenAI announcement');
    expect(requestUrl.searchParams.get('max')).toBe('5');
    expect(requestUrl.searchParams.get('sortby')).toBe('relevance');

    expect(init?.headers).toEqual({
      Accept: 'application/json',
      'X-Api-Key': 'test-api-key',
    });

    expect(String(url)).not.toContain('test-api-key');
  });

  it('trims a search query before sending it', async () => {
    const fixture = await loadFixture();

    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return Response.json(fixture);
    });

    const source = new GNewsSource({
      apiKey: 'test-api-key',
      fetchImpl,
    });

    await source.search({
      query: '  AI regulation  ',
      limit: 5,
    });

    const [url] = fetchImpl.mock.calls[0]!;

    expect(new URL(String(url)).searchParams.get('q')).toBe('AI regulation');
  });

  it('rejects a blank search query before provider dispatch', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    const source = new GNewsSource({
      apiKey: 'test-api-key',
      fetchImpl,
    });

    await expect(
      source.search({
        query: '   ',
        limit: 5,
      }),
    ).rejects.toThrow('GNews search query must not be empty.');

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects search queries longer than the provider bound', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    const source = new GNewsSource({
      apiKey: 'test-api-key',
      fetchImpl,
    });

    await expect(
      source.search({
        query: 'x'.repeat(201),
        limit: 5,
      }),
    ).rejects.toThrow('GNews search query must not exceed 200 characters.');

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a non-positive search limit', async () => {
    const source = new GNewsSource({
      apiKey: 'test-api-key',
    });

    await expect(
      source.search({
        query: 'AI',
        limit: 0,
      }),
    ).rejects.toThrow('GNews search limit must be a positive integer.');
  });

  it('caps search results at the provider maximum', async () => {
    const fixture = await loadFixture();

    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return Response.json(fixture);
    });

    const source = new GNewsSource({
      apiKey: 'test-api-key',
      fetchImpl,
    });

    await source.search({
      query: 'AI',
      limit: 500,
    });

    const [url] = fetchImpl.mock.calls[0]!;

    expect(new URL(String(url)).searchParams.get('max')).toBe('100');
  });

  it('marks search results truncated when more matches exist', async () => {
    const fixture = (await loadFixture()) as {
      articles: unknown[];
    };

    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return Response.json({
        ...fixture,
        totalArticles: 25,
      });
    });

    const source = new GNewsSource({
      apiKey: 'test-api-key',
      fetchImpl,
    });

    const result = await source.search({
      query: 'AI',
      limit: 5,
    });

    expect(result.articles).toHaveLength(2);
    expect(result.totalArticles).toBe(25);
    expect(result.truncated).toBe(true);
  });

  it('uses the same safe provider error handling as top headlines', async () => {
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
      source.search({
        query: 'AI',
        limit: 5,
      }),
    ).rejects.toMatchObject({
      name: 'GNewsError',
      kind: 'http',
      statusCode: 429,
    });
  });
});
