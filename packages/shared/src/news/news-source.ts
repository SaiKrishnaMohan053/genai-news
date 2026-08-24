import type { NewsSourceDescriptor, NewsSourceType, SourceArticle } from './source-article.js';

export type NewsSourceFetchInput = {
  limit: number;
};

export type NewsSourceResult = {
  source: NewsSourceDescriptor;
  fetchedAt: Date;
  articles: SourceArticle[];
};

/**
 * Contract implemented by every deterministic news discovery adapter.
 *
 * Provider-specific request and response types must remain inside the
 * adapter implementation and must not leak through this interface.
 */
export interface NewsSource {
  readonly id: string;
  readonly name: string;
  readonly type: NewsSourceType;

  fetchLatest(input: NewsSourceFetchInput): Promise<NewsSourceResult>;
}
