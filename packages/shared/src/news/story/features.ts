import { normalizeRequiredText } from '../normalization/text-normalizer.js';

import type { StoryFeatureArticle, StoryFeatures } from './contracts.js';

/**
 * Extracts deterministic, provider-neutral story features from a persisted
 * article-shaped input.
 *
 * This function performs no similarity scoring, candidate selection,
 * clustering decision, or persistence.
 */
export function extractStoryFeatures(article: StoryFeatureArticle): StoryFeatures {
  const articleId = normalizeRequiredText(article.id);

  if (articleId === null) {
    throw new Error('Story feature article id must be a non-empty string.');
  }

  const title = normalizeRequiredText(article.title);

  if (title === null) {
    throw new Error('Story feature article title must be a non-empty string.');
  }

  validatePublishedAt(article.publishedAt);

  const normalizedTitle = title.toLowerCase();

  const titleTokens = tokenizeStoryTitle(normalizedTitle);

  const publisherName =
    article.publisherName === null ? null : normalizeRequiredText(article.publisherName);

  return {
    articleId,
    title,
    normalizedTitle,
    titleTokens,
    publishedAt: article.publishedAt === null ? null : new Date(article.publishedAt.getTime()),
    publisherName,
  };
}

/**
 * Deterministically extracts ordered lexical tokens.
 *
 * Tokens consist of Unicode letters/numbers and may contain an internal
 * straight or curly apostrophe. Punctuation otherwise acts as a boundary.
 *
 * Examples:
 *
 * "Model X: Launches Today"
 *   -> ["model", "x", "launches", "today"]
 *
 * "company doesn't launch"
 *   -> ["company", "doesn't", "launch"]
 */
export function tokenizeStoryTitle(normalizedTitle: string): readonly string[] {
  const matches = normalizedTitle.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];

  return matches;
}

function validatePublishedAt(publishedAt: Date | null): void {
  if (publishedAt !== null && Number.isNaN(publishedAt.getTime())) {
    throw new Error('Story feature article publishedAt must be a valid Date when present.');
  }
}
