export const NEWS_SOURCE_TYPES = ['api', 'rss'] as const;

export type NewsSourceType = (typeof NEWS_SOURCE_TYPES)[number];

/**
 * Identifies the mechanism/source through which an article was discovered.
 *
 * Examples:
 * - GNews API
 * - Guardian API
 * - BBC World RSS feed
 */
export type NewsSourceDescriptor = {
  id: string;
  name: string;
  type: NewsSourceType;
};

/**
 * Identifies the publisher responsible for the article.
 *
 * This is intentionally separate from NewsSourceDescriptor because the
 * discovery provider and article publisher are not necessarily the same.
 */
export type ArticlePublisher = {
  name: string;
  id?: string;
};

/**
 * Provider-neutral representation emitted by a NewsSource adapter.
 *
 * Fields that external systems commonly omit or provide incorrectly remain
 * optional here. Normalization decides whether an article is acceptable.
 */
export type SourceArticle = {
  externalId?: string;

  title?: string;
  url?: string;
  publishedAt?: string;

  author?: string;
  summary?: string;
  category?: string;

  publisher?: ArticlePublisher;

  metadata?: Record<string, unknown>;
};
