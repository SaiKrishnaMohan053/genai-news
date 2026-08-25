import type { NormalizedArticle } from '../normalized-article.js';

export const ARTICLE_DEDUP_KEY_TYPES = [
  'source-external-id',
  'canonical-url',
  'publisher-title',
] as const;

export type ArticleDedupKeyType = (typeof ARTICLE_DEDUP_KEY_TYPES)[number];

export type ArticleDedupKey = {
  type: ArticleDedupKeyType;
  value: string;
};

export function createArticleDedupKeys(article: NormalizedArticle): ArticleDedupKey[] {
  const keys: ArticleDedupKey[] = [];

  if (article.externalId !== null) {
    keys.push({
      type: 'source-external-id',
      value: createSourceExternalIdKey(article.source.id, article.externalId),
    });
  }

  keys.push({
    type: 'canonical-url',
    value: article.canonicalUrl,
  });

  const publisherIdentity = createPublisherIdentity(article);

  if (publisherIdentity !== null) {
    keys.push({
      type: 'publisher-title',
      value: `${publisherIdentity}:${normalizeTitleForDedup(article.title)}`,
    });
  }

  return keys;
}

export function normalizeTitleForDedup(title: string): string {
  return title.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();
}

function createSourceExternalIdKey(sourceId: string, externalId: string): string {
  return `${normalizeIdentityPart(sourceId)}:${normalizeIdentityPart(externalId)}`;
}

function createPublisherIdentity(article: NormalizedArticle): string | null {
  if (article.publisher === null) {
    return null;
  }

  /*
   * Publisher name is intentionally used as the cross-source identity.
   *
   * Provider-specific publisher IDs are not guaranteed to be stable
   * across API and RSS adapters.
   */
  return normalizeIdentityPart(article.publisher.name);
}

function normalizeIdentityPart(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();
}
