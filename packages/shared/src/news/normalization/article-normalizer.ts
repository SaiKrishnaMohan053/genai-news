import type { NormalizedArticle } from '../normalized-article.js';
import {
  newsSourceDescriptorSchema,
  normalizedArticleSchema,
  sourceArticleSchema,
} from '../schemas.js';

import { normalizeOptionalText, normalizeRequiredText } from './text-normalizer.js';
import { normalizeArticleUrl } from './url-normalizer.js';

export const ARTICLE_NORMALIZATION_REJECTION_REASONS = [
  'invalid-source',
  'invalid-article-shape',
  'missing-title',
  'missing-url',
  'invalid-url',
  'invalid-published-at',
] as const;

export type ArticleNormalizationRejectionReason =
  (typeof ARTICLE_NORMALIZATION_REJECTION_REASONS)[number];

export type ArticleNormalizationResult =
  | {
      status: 'accepted';
      article: NormalizedArticle;
    }
  | {
      status: 'rejected';
      reason: ArticleNormalizationRejectionReason;
    };

export type NormalizeArticleInput = {
  source: unknown;
  article: unknown;
  discoveredAt?: Date;
};

export function normalizeSourceArticle(input: NormalizeArticleInput): ArticleNormalizationResult {
  const sourceResult = newsSourceDescriptorSchema.safeParse(input.source);

  if (!sourceResult.success) {
    return reject('invalid-source');
  }

  const articleResult = sourceArticleSchema.safeParse(input.article);

  if (!articleResult.success) {
    return reject('invalid-article-shape');
  }

  const sourceArticle = articleResult.data;

  const title =
    sourceArticle.title === undefined ? null : normalizeRequiredText(sourceArticle.title);

  if (title === null) {
    return reject('missing-title');
  }

  if (sourceArticle.url === undefined || sourceArticle.url.trim() === '') {
    return reject('missing-url');
  }

  const normalizedUrl = normalizeArticleUrl(sourceArticle.url);

  if (normalizedUrl === null) {
    return reject('invalid-url');
  }

  const publishedAt = normalizePublishedAt(sourceArticle.publishedAt);

  if (publishedAt === undefined) {
    return reject('invalid-published-at');
  }

  const discoveredAt = input.discoveredAt ?? new Date();

  if (Number.isNaN(discoveredAt.getTime())) {
    throw new Error('discoveredAt must be a valid Date.');
  }

  const publisher = sourceArticle.publisher
    ? {
        name: normalizeRequiredText(sourceArticle.publisher.name)!,
        ...(sourceArticle.publisher.id !== undefined
          ? {
              id: normalizeRequiredText(sourceArticle.publisher.id)!,
            }
          : {}),
      }
    : null;

  const normalized: NormalizedArticle = {
    title,

    url: normalizedUrl.url,
    canonicalUrl: normalizedUrl.canonicalUrl,

    source: sourceResult.data,

    publisher,

    externalId: normalizeOptionalText(sourceArticle.externalId),

    publishedAt,
    discoveredAt,

    author: normalizeOptionalText(sourceArticle.author),
    summary: normalizeOptionalText(sourceArticle.summary),
    category: normalizeOptionalText(sourceArticle.category),

    metadata: sourceArticle.metadata ?? null,
  };

  const normalizedResult = normalizedArticleSchema.safeParse(normalized);

  if (!normalizedResult.success) {
    throw new Error(`Normalized article invariant failed: ${normalizedResult.error.message}`);
  }

  return {
    status: 'accepted',
    article: normalized,
  };
}

function normalizePublishedAt(value: string | undefined): Date | null | undefined {
  if (value === undefined || value.trim() === '') {
    return null;
  }

  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return undefined;
  }

  return timestamp;
}

function reject(reason: ArticleNormalizationRejectionReason): ArticleNormalizationResult {
  return {
    status: 'rejected',
    reason,
  };
}
