import type { ArticlePublisher, NewsSourceDescriptor } from './source-article.js';

/**
 * Provider-independent article representation produced after deterministic
 * normalization.
 *
 * This is not yet the Prisma persistence model. Database identity and
 * persistence-specific timestamps will be designed in Phase 1.7.
 */
export type NormalizedArticle = {
  title: string;

  url: string;
  canonicalUrl: string;

  source: NewsSourceDescriptor;
  publisher: ArticlePublisher | null;

  externalId: string | null;

  publishedAt: Date | null;
  discoveredAt: Date;

  author: string | null;
  summary: string | null;
  category: string | null;

  metadata: Record<string, unknown> | null;
};
