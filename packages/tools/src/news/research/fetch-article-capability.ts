import {
  createResearchToolError,
  type ResearchFetchInput,
  type ResearchFetchResult,
  type ResearchSource,
  type ResearchToolExecution,
} from '@genai-news/shared';

import {
  fetchResearchArticle,
  ResearchArticleFetchError,
  type FetchedResearchArticle,
} from './article-fetcher.js';

export type ResearchSourceLookup = (sourceId: string) => ResearchSource | undefined;

export type ResearchArticleFetcher = (
  url: string,
  options: Readonly<{
    signal?: AbortSignal;
  }>,
) => Promise<FetchedResearchArticle>;

export type FetchArticleCapabilityOptions = Readonly<{
  getSource: ResearchSourceLookup;
  fetchArticle?: ResearchArticleFetcher;
}>;

/**
 * Creates the deterministic application capability behind the agent-facing
 * fetch_article tool.
 *
 * The model supplies only sourceId. The URL always comes from the
 * application-owned source catalog.
 */
export function createFetchArticleCapability(options: FetchArticleCapabilityOptions) {
  const fetchArticle: ResearchArticleFetcher =
    options.fetchArticle ??
    ((url, fetchOptions) =>
      fetchResearchArticle(url, {
        ...(fetchOptions.signal === undefined ? {} : { signal: fetchOptions.signal }),
      }));

  return async function fetchArticleCapability(
    input: ResearchFetchInput,
    execution: ResearchToolExecution,
  ): Promise<ResearchFetchResult> {
    execution.signal?.throwIfAborted();

    const source = options.getSource(input.sourceId);

    if (source === undefined) {
      return createResearchToolError('unknown-source');
    }

    try {
      const fetched = await fetchArticle(source.url, {
        ...(execution.signal === undefined ? {} : { signal: execution.signal }),
      });

      execution.signal?.throwIfAborted();

      return {
        status: 'ok',
        sourceId: source.sourceId,
        text: fetched.text,
        fetchedAt: fetched.fetchedAt.toISOString(),
        truncated: fetched.truncated,
      };
    } catch (error) {
      execution.signal?.throwIfAborted();

      return mapFetchError(error);
    }
  };
}

function mapFetchError(error: unknown): ResearchFetchResult {
  if (!(error instanceof ResearchArticleFetchError)) {
    return createResearchToolError('tool-failed');
  }

  switch (error.kind) {
    case 'blocked-url':
    case 'invalid-redirect':
      return createResearchToolError('blocked-url');

    case 'timeout':
      return createResearchToolError('timeout');

    case 'unsupported-content':
    case 'response-too-large':
      return createResearchToolError('unsupported-content');

    case 'network':
      return createResearchToolError('unavailable');

    case 'http':
      return mapHttpFailure(error.statusCode);
  }
}

function mapHttpFailure(statusCode: number | undefined): ResearchFetchResult {
  if (statusCode === 408 || statusCode === 504) {
    return createResearchToolError('timeout');
  }

  if (statusCode === 429) {
    return createResearchToolError('rate-limited');
  }

  if (
    statusCode === 502 ||
    statusCode === 503 ||
    statusCode === 521 ||
    statusCode === 522 ||
    statusCode === 523 ||
    statusCode === 524
  ) {
    return createResearchToolError('unavailable');
  }

  return createResearchToolError('tool-failed');
}
