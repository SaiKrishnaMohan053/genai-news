import type {
  ResearchSource,
  ResearchToolExecution,
} from '@genai-news/shared';

import { describe, expect, it, vi } from 'vitest';

import {
  GNewsError,
  createRelatedSourceSearchCapability,
  type RegisterObservedResearchSources,
  type ResearchObservedSearchCandidate,
  type ResearchSearchProvider,
} from '../src/index.js';

const execution: ResearchToolExecution = {
  researchRunId: 'run-1',
  storyId: 'story-1',
  toolCallId: 'call-related-1',
  toolName: 'find_related_sources',
};

function providerArticles() {
  return [
    {
      externalId: 'provider-known',
      title: 'Existing coverage',
      url: 'https://known.example.com/story?utm_source=gnews',
      publishedAt: '2026-09-29T18:00:00Z',
      summary: 'Already known.',
      publisher: {
        name: 'Known News',
      },
      metadata: {},
    },
    {
      externalId: 'provider-new-1',
      title: 'Additional coverage',
      url: 'https://new.example.com/report?utm_medium=social',
      publishedAt: '2026-09-29T18:30:00Z',
      summary: 'Additional source excerpt.',
      publisher: {
        name: 'New News',
      },
      metadata: {},
    },
    {
      externalId: 'provider-new-duplicate',
      title: 'Duplicate additional coverage',
      url: 'https://new.example.com/report?utm_source=duplicate',
      publishedAt: '2026-09-29T18:31:00Z',
      summary: 'Duplicate excerpt.',
      publisher: {
        name: 'New News',
      },
      metadata: {},
    },
    {
      externalId: 'provider-new-2',
      title: 'Second additional source',
      url: 'https://other.example.org/article',
      publishedAt: 'not-a-date',
      summary: 'Second source excerpt.',
      publisher: {
        name: 'Other News',
      },
      metadata: {},
    },
  ];
}

function searchProvider(): ResearchSearchProvider {
  return vi.fn(async () => ({
    fetchedAt: new Date('2026-09-29T19:00:00.000Z'),
    totalArticles: 4,
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
      candidates.map(
        (
          candidate: ResearchObservedSearchCandidate,
          index: number,
        ) => ({
          sourceId: `related-source-${index + 1}`,
          url: candidate.url,
          canonicalUrl: candidate.canonicalUrl,
          title: candidate.title,
          publisherName: candidate.publisherName,
          publishedAt: candidate.publishedAt,
          observedAt: new Date(
            '2026-09-29T19:00:00.000Z',
          ),
          provenance: [
            {
              kind: 'tool-result' as const,
              toolCallId: execution.toolCallId,
              toolName: execution.toolName,
            },
          ],
        }),
      ),
  );
}

describe('related-source research search capability', () => {
  it('uses the bounded deterministic search provider', async () => {
    const search = searchProvider();

    const capability = createRelatedSourceSearchCapability({
      search,
      registerObservedSources: registrar(),
      getKnownCanonicalUrls: () => [
        'https://known.example.com/story',
      ],
      limit: 5,
    });

    await capability(
      {
        query: 'additional reporting on AI announcement',
      },
      execution,
    );

    expect(search).toHaveBeenCalledExactlyOnceWith({
      query: 'additional reporting on AI announcement',
      limit: 5,
    });
  });

  it('excludes already-known canonical URLs including tracking variants', async () => {
    const registerObservedSources = registrar();

    const capability = createRelatedSourceSearchCapability({
      search: searchProvider(),
      registerObservedSources,
      getKnownCanonicalUrls: () => [
        'https://known.example.com/story',
      ],
    });

    const result = await capability(
      {
        query: 'additional coverage',
      },
      execution,
    );

    const call =
      vi.mocked(registerObservedSources).mock.calls[0]?.[0];

    expect(call?.candidates).toEqual([
      {
        url: 'https://new.example.com/report?utm_medium=social',
        canonicalUrl: 'https://new.example.com/report',
        title: 'Additional coverage',
        publisherName: 'New News',
        publishedAt: new Date(
          '2026-09-29T18:30:00.000Z',
        ),
        excerpt: 'Additional source excerpt.',
      },
      {
        url: 'https://other.example.org/article',
        canonicalUrl: 'https://other.example.org/article',
        title: 'Second additional source',
        publisherName: 'Other News',
        publishedAt: null,
        excerpt: 'Second source excerpt.',
      },
    ]);

    expect(result).toMatchObject({
      status: 'ok',
      rejectedCount: 2,
      truncated: false,
    });
  });

  it('deduplicates new canonical URLs before registration', async () => {
    const registerObservedSources = registrar();

    const capability = createRelatedSourceSearchCapability({
      search: searchProvider(),
      registerObservedSources,
      getKnownCanonicalUrls: () => [],
    });

    await capability(
      {
        query: 'additional coverage',
      },
      execution,
    );

    const candidates =
      vi.mocked(registerObservedSources).mock.calls[0]?.[0]
        .candidates;

    expect(candidates).toHaveLength(3);

    expect(
      candidates?.filter(
        (candidate) =>
          candidate.canonicalUrl ===
          'https://new.example.com/report',
      ),
    ).toHaveLength(1);
  });

  it('returns only application-registered source references', async () => {
    const capability = createRelatedSourceSearchCapability({
      search: searchProvider(),
      registerObservedSources: registrar(),
      getKnownCanonicalUrls: () => [
        'https://known.example.com/story',
      ],
    });

    expect(
      await capability(
        {
          query: 'additional coverage',
        },
        execution,
      ),
    ).toEqual({
      status: 'ok',
      sources: [
        {
          sourceId: 'related-source-1',
          title: 'Additional coverage',
          publisherName: 'New News',
          publishedAt: '2026-09-29T18:30:00.000Z',
          excerpt: null,
        },
        {
          sourceId: 'related-source-2',
          title: 'Second additional source',
          publisherName: 'Other News',
          publishedAt: null,
          excerpt: null,
        },
      ],
      rejectedCount: 2,
      truncated: false,
    });
  });

  it('returns empty success when every provider result is already known', async () => {
    const search =
      vi.fn<ResearchSearchProvider>().mockResolvedValue({
        fetchedAt: new Date(),
        totalArticles: 2,
        articles: [
          {
            title: 'Known one',
            url: 'https://known.example.com/story?utm_source=a',
            metadata: {},
          },
          {
            title: 'Known two',
            url: 'https://known.example.com/story?utm_source=b',
            metadata: {},
          },
        ],
        truncated: false,
      });

    const registerObservedSources = registrar();

    const capability = createRelatedSourceSearchCapability({
      search,
      registerObservedSources,
      getKnownCanonicalUrls: () => [
        'https://known.example.com/story',
      ],
    });

    expect(
      await capability(
        {
          query: 'more coverage',
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

  it('reads known canonical URLs at invocation time', async () => {
    const known = new Set<string>();

    const registerObservedSources = registrar();

    const search =
      vi.fn<ResearchSearchProvider>().mockResolvedValue({
        fetchedAt: new Date(),
        totalArticles: 1,
        articles: [
          {
            title: 'Candidate',
            url: 'https://candidate.example.com/story',
            metadata: {},
          },
        ],
        truncated: false,
      });

    const capability = createRelatedSourceSearchCapability({
      search,
      registerObservedSources,
      getKnownCanonicalUrls: () => [...known],
    });

    const first = await capability(
      {
        query: 'coverage',
      },
      execution,
    );

    expect(first).toMatchObject({
      status: 'ok',
      rejectedCount: 0,
    });

    known.add('https://candidate.example.com/story');

    vi.mocked(registerObservedSources).mockClear();

    const second = await capability(
      {
        query: 'coverage',
      },
      {
        ...execution,
        toolCallId: 'call-related-2',
      },
    );

    expect(second).toEqual({
      status: 'ok',
      sources: [],
      rejectedCount: 1,
      truncated: false,
    });

    expect(registerObservedSources).not.toHaveBeenCalled();
  });

  it('fails safely when known-source lookup fails', async () => {
    const capability = createRelatedSourceSearchCapability({
      search: searchProvider(),
      registerObservedSources: registrar(),
      getKnownCanonicalUrls: () => {
        throw new Error('private catalog failure');
      },
    });

    expect(
      await capability(
        {
          query: 'coverage',
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

  it('rejects inconsistent registration output', async () => {
    const registerObservedSources =
      vi.fn<RegisterObservedResearchSources>().mockResolvedValue([
        {
          sourceId: 'wrong-source',
          url: 'https://wrong.example.com/',
          canonicalUrl: 'https://wrong.example.com/',
          title: 'Wrong',
          publisherName: null,
          publishedAt: null,
          observedAt: new Date(),
          provenance: [
            {
              kind: 'tool-result',
              toolCallId: 'call-related-1',
              toolName: 'find_related_sources',
            },
          ],
        },
      ]);

    const capability = createRelatedSourceSearchCapability({
      search: searchProvider(),
      registerObservedSources,
      getKnownCanonicalUrls: () => [
        'https://known.example.com/story',
      ],
    });

    expect(
      await capability(
        {
          query: 'coverage',
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

  it('preserves provider truncation metadata', async () => {
    const search =
      vi.fn<ResearchSearchProvider>().mockResolvedValue({
        fetchedAt: new Date(),
        totalArticles: 100,
        articles: providerArticles(),
        truncated: true,
      });

    const capability = createRelatedSourceSearchCapability({
      search,
      registerObservedSources: registrar(),
      getKnownCanonicalUrls: () => [],
    });

    expect(
      await capability(
        {
          query: 'coverage',
        },
        execution,
      ),
    ).toMatchObject({
      status: 'ok',
      truncated: true,
    });
  });

  it('maps provider rate limits safely', async () => {
    const search =
      vi.fn<ResearchSearchProvider>().mockRejectedValue(
        new GNewsError({
          kind: 'http',
          statusCode: 429,
          message: 'provider secret',
        }),
      );

    const capability = createRelatedSourceSearchCapability({
      search,
      registerObservedSources: registrar(),
      getKnownCanonicalUrls: () => [],
    });

    expect(
      await capability(
        {
          query: 'coverage',
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
    const search =
      vi.fn<ResearchSearchProvider>().mockRejectedValue(
        new Error('secret API key and stack'),
      );

    const capability = createRelatedSourceSearchCapability({
      search,
      registerObservedSources: registrar(),
      getKnownCanonicalUrls: () => [],
    });

    expect(
      await capability(
        {
          query: 'coverage',
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

  it('propagates cancellation before provider execution', async () => {
    const controller = new AbortController();
    const search = searchProvider();

    controller.abort(new Error('cancelled'));

    const capability = createRelatedSourceSearchCapability({
      search,
      registerObservedSources: registrar(),
      getKnownCanonicalUrls: () => [],
    });

    await expect(
      capability(
        {
          query: 'coverage',
        },
        {
          ...execution,
          signal: controller.signal,
        },
      ),
    ).rejects.toThrow('cancelled');

    expect(search).not.toHaveBeenCalled();
  });

  it('rejects limits above the tool contract maximum', () => {
    expect(() =>
      createRelatedSourceSearchCapability({
        search: searchProvider(),
        registerObservedSources: registrar(),
        getKnownCanonicalUrls: () => [],
        limit: 11,
      }),
    ).toThrow(
      'Research search limit must be between 1 and 10.',
    );
  });
});