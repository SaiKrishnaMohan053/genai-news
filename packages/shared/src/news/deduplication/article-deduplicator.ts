import type { NormalizedArticle } from '../normalized-article.js';

import { createArticleDedupKeys, type ArticleDedupKeyType } from './dedup-keys.js';

export type DuplicateArticleDecision = {
  duplicateIndex: number;
  originalIndex: number;

  reason: ArticleDedupKeyType;
  matchedKey: string;

  article: NormalizedArticle;
  originalArticle: NormalizedArticle;
};

export type ArticleDeduplicationResult = {
  uniqueArticles: NormalizedArticle[];
  duplicates: DuplicateArticleDecision[];
};

type SeenArticle = {
  index: number;
  article: NormalizedArticle;
};

export function deduplicateArticles(
  articles: readonly NormalizedArticle[],
): ArticleDeduplicationResult {
  const seenKeys = new Map<string, SeenArticle>();

  const uniqueArticles: NormalizedArticle[] = [];
  const duplicates: DuplicateArticleDecision[] = [];

  for (const [index, article] of articles.entries()) {
    const keys = createArticleDedupKeys(article);

    const duplicateMatch = findDuplicateMatch(keys, seenKeys);

    if (duplicateMatch !== null) {
      duplicates.push({
        duplicateIndex: index,
        originalIndex: duplicateMatch.seen.index,

        reason: duplicateMatch.type,
        matchedKey: duplicateMatch.value,

        article,
        originalArticle: duplicateMatch.seen.article,
      });

      continue;
    }

    uniqueArticles.push(article);

    /*
     * Only keys from accepted unique representatives are registered.
     *
     * We deliberately avoid propagating new keys from duplicate rows
     * because doing so could create transitive merges that have no
     * direct deterministic match to the original representative.
     */
    for (const key of keys) {
      seenKeys.set(createRegistryKey(key.type, key.value), {
        index,
        article,
      });
    }
  }

  return {
    uniqueArticles,
    duplicates,
  };
}

type DuplicateMatch = {
  type: ArticleDedupKeyType;
  value: string;
  seen: SeenArticle;
};

function findDuplicateMatch(
  keys: ReturnType<typeof createArticleDedupKeys>,
  seenKeys: ReadonlyMap<string, SeenArticle>,
): DuplicateMatch | null {
  for (const key of keys) {
    const seen = seenKeys.get(createRegistryKey(key.type, key.value));

    if (seen !== undefined) {
      return {
        type: key.type,
        value: key.value,
        seen,
      };
    }
  }

  return null;
}

function createRegistryKey(type: ArticleDedupKeyType, value: string): string {
  return `${type}:${value}`;
}
