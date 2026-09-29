import { describe, expect, it, vi } from 'vitest';

import type { ResearchSource, ResearchToolExecution } from '@genai-news/shared';

import {
  GNewsError,
  createOfficialSourceSearchCapability,
  type RegisterObservedResearchSources,
  type ResearchObservedSearchCandidate,
  type ResearchSearchProvider,
} from '../src/index.js';

const execution = {
  researchRunId: 'run-1',
  storyId: 'story-1',
  toolCallId: 'call-1',
  toolName: 'search_official_source' as const,
};

function providerArticles() {
  return [
    {
      externalId: 'provider-1',
      title: 'Official announcement',
      url: 'https://example.com/announcement?utm_source=gnews',
      publishedAt: '2026-09-29T18:00:00Z',
      summary: 'Announcement excerpt.',
      publisher: {
        name: 'Example',
      },
      metadata: {},
    },
    {
      externalId: 'provider-2',
      title: 'Duplicate announcement',
      url: 'https://example.com/announcement?utm_medium=social',
      publishedAt: '2026-09-29T18:00:00Z',
      summary: 'Duplicate.',
      publisher: {
        name: 'Example',
      },
      metadata: {},
    },
    {
      externalId: 'provider-3',
      title: 'Documentation',
      url: 'https://docs.example.org/release',
      publishedAt: 'not-a-date',
      summary: 'Documentation excerpt.',
      publisher: {
        name: 'Example Docs',
      },
      metadata: {},
    },
  ];
}

function searchProvider(): ResearchSearchProvider {
  return vi.fn(async () => ({
    fetchedAt: new Date('2026-09-29T19:00:00.000Z'),
    totalArticles: 3,
    articles: providerArticles(),
    truncated: false,
  }));
}

function registrar(): RegisterObservedResearchSources {
  return vi.fn(
    async ({
      candidates,
      execution,
    }: Readonly<{
      candidates: readonly ResearchObservedSearchCandidate[];
      execution: ResearchToolExecution;
    }>): Promise<readonly ResearchSource[]> =>
      candidates.map((candidate: ResearchObservedSearchCandidate, index: number) => ({
        sourceId: `source-${index + 1}`,
        url: candidate.url,
        canonicalUrl: candidate.canonicalUrl,
        title: candidate.title,
        publisherName: candidate.publisherName,
        publishedAt: candidate.publishedAt,
        observedAt: new Date('2026-09-29T19:00:00.000Z'),
        provenance: [
          {
            kind: 'tool-result' as const,
            toolCallId: execution.toolCallId,
            toolName: execution.toolName,
          },
        ],
      })),
  );
}

describe('official-source research search capability', () => {
  it('searches with a bounded provider limit', async () => {
    const search = searchProvider();
    const registerObservedSources = registrar();

    const capability = createOfficialSourceSearchCapability({
      search,
      registerObservedSources,
      limit: 5,
    });

    await capability(
      {
        query: 'OpenAI announcement',
      },
      execution,
    );

    expect(search).toHaveBeenCalledExactlyOnceWith({
      query: 'OpenAI announcement',
      limit: 5,
    });
  });

  it('normalizes, canonicalizes, and deduplicates provider URLs before registration', async () => {
    const registerObservedSources = registrar();

    const capability = createOfficialSourceSearchCapability({
      search: searchProvider(),
      registerObservedSources,
      limit: 5,
    });

    const result = await capability(
      {
        query: 'announcement',
      },
      execution,
    );

    expect(registerObservedSources).toHaveBeenCalledTimes(1);

    const call = vi.mocked(registerObservedSources).mock.calls[0]?.[0];

    expect(call?.candidates).toEqual([
      {
        url: 'https://example.com/announcement?utm_source=gnews',
        canonicalUrl: 'https://example.com/announcement',
        title: 'Official announcement',
        publisherName: 'Example',
        publishedAt: new Date('2026-09-29T18:00:00.000Z'),
        excerpt: 'Announcement excerpt.',
      },
      {
        url: 'https://docs.example.org/release',
        canonicalUrl: 'https://docs.example.org/release',
        title: 'Documentation',
        publisherName: 'Example Docs',
        publishedAt: null,
        excerpt: 'Documentation excerpt.',
      },
    ]);

    expect(call?.execution).toEqual(execution);

    expect(result).toMatchObject({
      status: 'ok',
      rejectedCount: 1,
      truncated: false,
    });
  });

  it('returns only application-registered source IDs', async () => {
    const capability = createOfficialSourceSearchCapability({
      search: searchProvider(),
      registerObservedSources: registrar(),
    });

    expect(
      await capability(
        {
          query: 'announcement',
        },
        execution,
      ),
    ).toEqual({
      status: 'ok',
      sources: [
        {
          sourceId: 'source-1',
          title: 'Official announcement',
          publisherName: 'Example',
          publishedAt: '2026-09-29T18:00:00.000Z',
          excerpt: null,
        },
        {
          sourceId: 'source-2',
          title: 'Documentation',
          publisherName: 'Example Docs',
          publishedAt: null,
          excerpt: null,
        },
      ],
      rejectedCount: 1,
      truncated: false,
    });
  });

  it('returns empty success without registration when provider has no usable results', async () => {
    const search = vi.fn<ResearchSearchProvider>().mockResolvedValue({
      fetchedAt: new Date(),
      totalArticles: 2,
      articles: [
        {
          title: 'No URL',
          metadata: {},
        },
        {
          title: 'Bad URL',
          url: 'file:///tmp/private',
          metadata: {},
        },
      ],
      truncated: false,
    });

    const registerObservedSources = registrar();

    const capability = createOfficialSourceSearchCapability({
      search,
      registerObservedSources,
    });

    expect(
      await capability(
        {
          query: 'announcement',
        },
        execution,
      ),
    ).toEqual({
      status: 'ok',
      sources: [],
      rejectedCount: 2,
      truncated: false,
    });

    expect(registerObservedSources).not.toHaveBeenCalled();
  });

  it('rejects inconsistent registration output', async () => {
    const registerObservedSources = vi.fn<RegisterObservedResearchSources>().mockResolvedValue([
      {
        sourceId: 'source-1',
        url: 'https://wrong.example.com/',
        canonicalUrl: 'https://wrong.example.com/',
        title: 'Wrong',
        publisherName: null,
        publishedAt: null,
        observedAt: new Date(),
        provenance: [
          {
            kind: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'search_official_source',
          },
        ],
      },
    ]);

    const capability = createOfficialSourceSearchCapability({
      search: searchProvider(),
      registerObservedSources,
    });

    expect(
      await capability(
        {
          query: 'announcement',
        },
        execution,
      ),
    ).toEqual({
      status: 'error',
      error: {
        code: 'invalid-result',
        retryable: false,
      },
    });
  });

  it('rejects duplicate source IDs returned by registration', async () => {
    const registerObservedSources: RegisterObservedResearchSources = vi.fn(
      async ({
        candidates,
      }: Readonly<{
        candidates: readonly ResearchObservedSearchCandidate[];
        execution: ResearchToolExecution;
      }>): Promise<readonly ResearchSource[]> =>
        candidates.map((candidate: ResearchObservedSearchCandidate) => ({
          sourceId: 'same-source',
          url: candidate.url,
          canonicalUrl: candidate.canonicalUrl,
          title: candidate.title,
          publisherName: candidate.publisherName,
          publishedAt: candidate.publishedAt,
          observedAt: new Date(),
          provenance: [
            {
              kind: 'tool-result' as const,
              toolCallId: 'call-1',
              toolName: 'search_official_source' as const,
            },
          ],
        })),
    );

    const capability = createOfficialSourceSearchCapability({
      search: searchProvider(),
      registerObservedSources,
    });

    expect(
      await capability(
        {
          query: 'announcement',
        },
        execution,
      ),
    ).toMatchObject({
      status: 'error',
      error: {
        code: 'invalid-result',
      },
    });
  });

  it('preserves provider truncation metadata', async () => {
    const search = vi.fn<ResearchSearchProvider>().mockResolvedValue({
      fetchedAt: new Date(),
      totalArticles: 50,
      articles: providerArticles(),
      truncated: true,
    });

    const capability = createOfficialSourceSearchCapability({
      search,
      registerObservedSources: registrar(),
    });

    expect(
      await capability(
        {
          query: 'announcement',
        },
        execution,
      ),
    ).toMatchObject({
      status: 'ok',
      truncated: true,
    });
  });

  it('bounds search output to at most ten sources', () => {
    expect(() =>
      createOfficialSourceSearchCapability({
        search: searchProvider(),
        registerObservedSources: registrar(),
        limit: 11,
      }),
    ).toThrow('Research search limit must be between 1 and 10.');
  });

  it('maps provider timeout safely', async () => {
    const search = vi.fn<ResearchSearchProvider>().mockRejectedValue(
      new GNewsError({
        kind: 'timeout',
        message: 'secret provider detail',
      }),
    );

    const capability = createOfficialSourceSearchCapability({
      search,
      registerObservedSources: registrar(),
    });

    expect(
      await capability(
        {
          query: 'announcement',
        },
        execution,
      ),
    ).toEqual({
      status: 'error',
      error: {
        code: 'timeout',
        retryable: true,
      },
    });
  });

  it('maps HTTP 429 to rate-limited', async () => {
    const search = vi.fn<ResearchSearchProvider>().mockRejectedValue(
      new GNewsError({
        kind: 'http',
        statusCode: 429,
        message: 'provider detail',
      }),
    );

    const capability = createOfficialSourceSearchCapability({
      search,
      registerObservedSources: registrar(),
    });

    expect(
      await capability(
        {
          query: 'announcement',
        },
        execution,
      ),
    ).toEqual({
      status: 'error',
      error: {
        code: 'rate-limited',
        retryable: true,
      },
    });
  });

  it('does not expose unexpected provider errors', async () => {
    const search = vi
      .fn<ResearchSearchProvider>()
      .mockRejectedValue(new Error('api key and internal stack'));

    const capability = createOfficialSourceSearchCapability({
      search,
      registerObservedSources: registrar(),
    });

    expect(
      await capability(
        {
          query: 'announcement',
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

  it('propagates cancellation before provider dispatch', async () => {
    const controller = new AbortController();
    const search = searchProvider();

    controller.abort(new Error('cancelled'));

    const capability = createOfficialSourceSearchCapability({
      search,
      registerObservedSources: registrar(),
    });

    await expect(
      capability(
        {
          query: 'announcement',
        },
        {
          ...execution,
          signal: controller.signal,
        },
      ),
    ).rejects.toThrow('cancelled');

    expect(search).not.toHaveBeenCalled();
  });

  it('propagates cancellation after provider execution', async () => {
    const controller = new AbortController();

    const search = vi.fn<ResearchSearchProvider>(async () => {
      controller.abort(new Error('cancelled'));

      return {
        fetchedAt: new Date(),
        totalArticles: 0,
        articles: [],
        truncated: false,
      };
    });

    const capability = createOfficialSourceSearchCapability({
      search,
      registerObservedSources: registrar(),
    });

    await expect(
      capability(
        {
          query: 'announcement',
        },
        {
          ...execution,
          signal: controller.signal,
        },
      ),
    ).rejects.toThrow('cancelled');
  });
});
