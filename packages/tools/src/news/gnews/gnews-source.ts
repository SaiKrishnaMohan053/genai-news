import {
  sourceArticleSchema,
  type NewsSource,
  type NewsSourceResult,
  type SourceArticle,
} from '@genai-news/shared';

import { GNewsError } from './gnews-error.js';
import { gnewsArticlesResponseSchema, type GNewsArticle } from './gnews-schema.js';

const DEFAULT_BASE_URL = 'https://gnews.io/api/v4';
const DEFAULT_TIMEOUT_MS = 10_000;
const GNEWS_MAX_RESULTS = 100;

type FetchLike = typeof fetch;

export type GNewsSourceOptions = {
  apiKey: string;
  timeoutMs?: number;
  baseUrl?: string;
  fetchImpl?: FetchLike;
};

export type GNewsSearchInput = Readonly<{
  query: string;
  limit: number;
}>;

export type GNewsSearchResult = Readonly<{
  fetchedAt: Date;
  totalArticles: number;
  articles: SourceArticle[];
  truncated: boolean;
}>;

export class GNewsSource implements NewsSource {
  readonly id = 'gnews';
  readonly name = 'GNews';
  readonly type = 'api' as const;

  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private async requestArticles(url: URL): Promise<{
    totalArticles: number;
    articles: GNewsArticle[];
  }> {
    let response: Response;

    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-Api-Key': this.apiKey,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw new GNewsError({
          kind: 'timeout',
          message: `GNews request timed out after ${this.timeoutMs}ms.`,
          cause: error,
        });
      }

      throw new GNewsError({
        kind: 'network',
        message: 'GNews request failed before receiving a response.',
        cause: error,
      });
    }

    if (!response.ok) {
      throw new GNewsError({
        kind: 'http',
        statusCode: response.status,
        message: `GNews request failed with HTTP ${response.status}.`,
      });
    }

    const body = await readJson(response);

    const parsed = gnewsArticlesResponseSchema.safeParse(body);

    if (!parsed.success) {
      throw new GNewsError({
        kind: 'invalid-response',
        message: 'GNews returned a response that does not match the expected schema.',
        cause: parsed.error,
      });
    }

    return parsed.data;
  }

  constructor(options: GNewsSourceOptions) {
    const apiKey = options.apiKey.trim();

    if (!apiKey) {
      throw new Error('GNews API key must not be empty.');
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      throw new Error('GNews timeout must be a positive integer.');
    }

    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async fetchLatest(input: { limit: number }): Promise<NewsSourceResult> {
    if (!Number.isInteger(input.limit) || input.limit <= 0) {
      throw new Error('GNews fetch limit must be a positive integer.');
    }

    const limit = Math.min(input.limit, GNEWS_MAX_RESULTS);

    const url = new URL(`${this.baseUrl}/top-headlines`);

    url.searchParams.set('category', 'general');
    url.searchParams.set('max', String(limit));

    const parsed = await this.requestArticles(url);

    return {
      source: {
        id: this.id,
        name: this.name,
        type: this.type,
      },
      fetchedAt: new Date(),
      articles: parsed.articles.map(mapGNewsArticle),
    };
  }

  async search(input: GNewsSearchInput): Promise<GNewsSearchResult> {
    const query = input.query.trim();

    if (!query) {
      throw new Error('GNews search query must not be empty.');
    }

    if (query.length > 200) {
      throw new Error('GNews search query must not exceed 200 characters.');
    }

    if (!Number.isInteger(input.limit) || input.limit <= 0) {
      throw new Error('GNews search limit must be a positive integer.');
    }

    const limit = Math.min(input.limit, GNEWS_MAX_RESULTS);

    const url = new URL(`${this.baseUrl}/search`);

    url.searchParams.set('q', query);
    url.searchParams.set('max', String(limit));
    url.searchParams.set('sortby', 'relevance');

    const parsed = await this.requestArticles(url);

    return {
      fetchedAt: new Date(),
      totalArticles: parsed.totalArticles,
      articles: parsed.articles.map(mapGNewsArticle),
      truncated: parsed.totalArticles > parsed.articles.length,
    };
  }
}

function mapGNewsArticle(article: GNewsArticle): SourceArticle {
  const mapped: SourceArticle = {
    externalId: article.id,
    title: article.title,
    url: article.url,
    publishedAt: article.publishedAt,

    publisher: {
      id: article.source.id,
      name: article.source.name,
    },

    metadata: {
      description: article.description ?? null,
      image: article.image ?? null,
      language: article.lang ?? null,
      sourceUrl: article.source.url,
      sourceCountry: article.source.country ?? null,
    },
  };

  if (article.description) {
    mapped.summary = article.description;
  }

  sourceArticleSchema.parse(mapped);

  return mapped;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new GNewsError({
      kind: 'invalid-json',
      message: 'GNews returned invalid JSON.',
      cause: error,
    });
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}
