import { describe, expect, it, vi } from 'vitest';

import {
  ResearchArticleFetchError,
  createFetchArticleCapability,
  type ResearchArticleFetcher,
} from '../src/index.js';

const source = {
  sourceId: 'source-1',
  url: 'https://example.com/story',
  canonicalUrl: 'https://example.com/story',
  title: 'Example story',
  publisherName: 'Example News',
  publishedAt: null,
  observedAt: new Date('2026-09-29T18:00:00.000Z'),
  provenance: [
    {
      kind: 'story-member' as const,
      articleId: 'article-1',
    },
  ],
};

const execution = {
  researchRunId: 'run-1',
  storyId: 'story-1',
  toolCallId: 'call-1',
  toolName: 'fetch_article' as const,
};

function successfulFetcher(): ResearchArticleFetcher {
  return vi.fn(async () => ({
    finalUrl: 'https://example.com/story',
    canonicalUrl: 'https://example.com/story',
    text: 'Retrieved article body.',
    fetchedAt: new Date('2026-09-29T19:00:00.000Z'),
    truncated: false,
    redirectCount: 0,
  }));
}

describe('fetch article research capability', () => {
  it('resolves sourceId through application-owned source lookup', async () => {
    const fetchArticle = successfulFetcher();

    const capability = createFetchArticleCapability({
      getSource: (sourceId) => (sourceId === source.sourceId ? source : undefined),
      fetchArticle,
    });

    const result = await capability(
      {
        sourceId: 'source-1',
      },
      execution,
    );

    expect(fetchArticle).toHaveBeenCalledExactlyOnceWith('https://example.com/story', {});

    expect(result).toEqual({
      status: 'ok',
      sourceId: 'source-1',
      text: 'Retrieved article body.',
      fetchedAt: '2026-09-29T19:00:00.000Z',
      truncated: false,
    });
  });

  it('never accepts a URL from model-owned input', async () => {
    const fetchArticle = successfulFetcher();

    const capability = createFetchArticleCapability({
      getSource: () => source,
      fetchArticle,
    });

    await capability(
      {
        sourceId: 'source-1',
      },
      execution,
    );

    expect(fetchArticle).toHaveBeenCalledWith(source.url, expect.any(Object));
  });

  it('returns unknown-source without invoking the fetcher', async () => {
    const fetchArticle = successfulFetcher();

    const capability = createFetchArticleCapability({
      getSource: () => undefined,
      fetchArticle,
    });

    expect(
      await capability(
        {
          sourceId: 'missing-source',
        },
        execution,
      ),
    ).toEqual({
      status: 'error',
      error: {
        code: 'unknown-source',
        retryable: false,
      },
    });

    expect(fetchArticle).not.toHaveBeenCalled();
  });

  it('preserves explicit article truncation metadata', async () => {
    const fetchArticle = vi.fn<ResearchArticleFetcher>().mockResolvedValue({
      finalUrl: source.url,
      canonicalUrl: source.canonicalUrl,
      text: 'bounded text',
      fetchedAt: new Date('2026-09-29T19:00:00.000Z'),
      truncated: true,
      redirectCount: 0,
    });

    const capability = createFetchArticleCapability({
      getSource: () => source,
      fetchArticle,
    });

    expect(
      await capability(
        {
          sourceId: source.sourceId,
        },
        execution,
      ),
    ).toMatchObject({
      status: 'ok',
      truncated: true,
    });
  });

  it.each([
    ['blocked-url', 'blocked-url', false],
    ['invalid-redirect', 'blocked-url', false],
    ['timeout', 'timeout', true],
    ['unsupported-content', 'unsupported-content', false],
    ['response-too-large', 'unsupported-content', false],
    ['network', 'unavailable', true],
  ] as const)(
    'maps transport failure %s to safe tool error %s',
    async (kind, expectedCode, expectedRetryable) => {
      const fetchArticle = vi
        .fn<ResearchArticleFetcher>()
        .mockRejectedValue(new ResearchArticleFetchError(kind));

      const capability = createFetchArticleCapability({
        getSource: () => source,
        fetchArticle,
      });

      expect(
        await capability(
          {
            sourceId: source.sourceId,
          },
          execution,
        ),
      ).toEqual({
        status: 'error',
        error: {
          code: expectedCode,
          retryable: expectedRetryable,
        },
      });
    },
  );

  it.each([
    [408, 'timeout', true],
    [429, 'rate-limited', true],
    [502, 'unavailable', true],
    [503, 'unavailable', true],
    [504, 'timeout', true],
    [404, 'tool-failed', false],
  ] as const)('maps HTTP %i to %s', async (statusCode, expectedCode, expectedRetryable) => {
    const fetchArticle = vi
      .fn<ResearchArticleFetcher>()
      .mockRejectedValue(new ResearchArticleFetchError('http', statusCode));

    const capability = createFetchArticleCapability({
      getSource: () => source,
      fetchArticle,
    });

    expect(
      await capability(
        {
          sourceId: source.sourceId,
        },
        execution,
      ),
    ).toEqual({
      status: 'error',
      error: {
        code: expectedCode,
        retryable: expectedRetryable,
      },
    });
  });

  it('does not expose unexpected exception details', async () => {
    const fetchArticle = vi
      .fn<ResearchArticleFetcher>()
      .mockRejectedValue(new Error('secret token and private infrastructure details'));

    const capability = createFetchArticleCapability({
      getSource: () => source,
      fetchArticle,
    });

    expect(
      await capability(
        {
          sourceId: source.sourceId,
        },
        execution,
      ),
    ).toEqual({
      status: 'error',
      error: {
        code: 'tool-failed',
        retryable: false,
      },
    });
  });

  it('passes application cancellation into the article fetcher', async () => {
    const controller = new AbortController();

    const fetchArticle = vi.fn<ResearchArticleFetcher>(async (_url, options) => {
      expect(options.signal).toBe(controller.signal);

      controller.abort(new Error('cancelled'));
      options.signal?.throwIfAborted();

      throw new Error('unreachable');
    });

    const capability = createFetchArticleCapability({
      getSource: () => source,
      fetchArticle,
    });

    await expect(
      capability(
        {
          sourceId: source.sourceId,
        },
        {
          ...execution,
          signal: controller.signal,
        },
      ),
    ).rejects.toThrow('cancelled');

    expect(fetchArticle).toHaveBeenCalledTimes(1);
  });

  it('checks pre-existing cancellation before source lookup', async () => {
    const controller = new AbortController();
    const getSource = vi.fn(() => source);

    controller.abort(new Error('already cancelled'));

    const capability = createFetchArticleCapability({
      getSource,
      fetchArticle: successfulFetcher(),
    });

    await expect(
      capability(
        {
          sourceId: source.sourceId,
        },
        {
          ...execution,
          signal: controller.signal,
        },
      ),
    ).rejects.toThrow('already cancelled');

    expect(getSource).not.toHaveBeenCalled();
  });
});
