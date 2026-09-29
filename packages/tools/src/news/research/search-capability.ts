import {
  createResearchToolError,
  normalizeArticleUrl,
  type ResearchSearchInput,
  type ResearchSearchResult,
  type ResearchSource,
  type ResearchToolExecution,
  type SourceArticle,
} from '@genai-news/shared';

import { GNewsError, type GNewsSearchResult } from '../gnews/index.js';

const DEFAULT_SEARCH_LIMIT = 5;
const MAX_TOOL_RESULTS = 10;
const MAX_TITLE_LENGTH = 500;
const MAX_PUBLISHER_LENGTH = 200;
const MAX_EXCERPT_LENGTH = 1000;

export type ResearchSearchProvider = (
  input: Readonly<{
    query: string;
    limit: number;
  }>,
) => Promise<GNewsSearchResult>;

export type ResearchObservedSearchCandidate = Readonly<{
  url: string;
  canonicalUrl: string;
  title: string | null;
  publisherName: string | null;
  publishedAt: Date | null;
  excerpt: string | null;
}>;

export type RegisterObservedResearchSources = (
  input: Readonly<{
    candidates: readonly ResearchObservedSearchCandidate[];
    execution: ResearchToolExecution;
  }>,
) => Promise<readonly ResearchSource[]>;

export type ResearchSearchCapabilityOptions = Readonly<{
  search: ResearchSearchProvider;
  registerObservedSources: RegisterObservedResearchSources;
  limit?: number;
}>;

export type RelatedSourceSearchCapabilityOptions = ResearchSearchCapabilityOptions &
  Readonly<{
    getKnownCanonicalUrls: () => readonly string[];
  }>;

/**
 * Deterministic capability backing search_official_source.
 *
 * "Official" is search intent only. Results are candidates and are never
 * treated here as authenticated, verified, or claim-confirming sources.
 */
export function createOfficialSourceSearchCapability(options: ResearchSearchCapabilityOptions) {
  return createSearchCapability(options, () => []);
}

/**
 * Deterministic capability backing find_related_sources.
 *
 * Existing canonical URLs are excluded before registration. Remaining
 * results are additional coverage candidates only; this capability does not
 * claim independence, confirmation, or verification.
 */
export function createRelatedSourceSearchCapability(options: RelatedSourceSearchCapabilityOptions) {
  return createSearchCapability(options, options.getKnownCanonicalUrls);
}

function createSearchCapability(
  options: ResearchSearchCapabilityOptions,
  getExcludedCanonicalUrls: () => readonly string[],
) {
  const limit = validateLimit(options.limit ?? DEFAULT_SEARCH_LIMIT);

  return async function searchCapability(
    input: ResearchSearchInput,
    execution: ResearchToolExecution,
  ): Promise<ResearchSearchResult> {
    execution.signal?.throwIfAborted();

    let providerResult: GNewsSearchResult;

    try {
      providerResult = await options.search({
        query: input.query,
        limit,
      });
    } catch (error) {
      execution.signal?.throwIfAborted();
      return mapSearchFailure(error);
    }

    execution.signal?.throwIfAborted();

    let excludedCanonicalUrls: readonly string[];

    try {
      excludedCanonicalUrls = getExcludedCanonicalUrls();
    } catch {
      return createResearchToolError('tool-failed');
    }

    const prepared = prepareCandidates(
      providerResult.articles,
      limit,
      new Set(excludedCanonicalUrls),
    );

    if (prepared.candidates.length === 0) {
      return {
        status: 'ok',
        sources: [],
        rejectedCount: prepared.rejectedCount,
        truncated: providerResult.truncated || providerResult.articles.length > limit,
      };
    }

    let registered: readonly ResearchSource[];

    try {
      registered = await options.registerObservedSources({
        candidates: prepared.candidates,
        execution,
      });
    } catch {
      execution.signal?.throwIfAborted();
      return createResearchToolError('tool-failed');
    }

    execution.signal?.throwIfAborted();

    if (!registrationMatches(prepared.candidates, registered)) {
      return createResearchToolError('invalid-result');
    }

    return {
      status: 'ok',
      sources: registered.map(toSourceView),
      rejectedCount: prepared.rejectedCount,
      truncated: providerResult.truncated || providerResult.articles.length > limit,
    };
  };
}

function prepareCandidates(
  articles: readonly SourceArticle[],
  limit: number,
  excludedCanonicalUrls: ReadonlySet<string>,
): Readonly<{
  candidates: readonly ResearchObservedSearchCandidate[];
  rejectedCount: number;
}> {
  const candidates: ResearchObservedSearchCandidate[] = [];
  const seenCanonicalUrls = new Set<string>();
  let rejectedCount = 0;

  for (const article of articles) {
    if (candidates.length >= limit) {
      break;
    }

    if (article.url === undefined) {
      rejectedCount += 1;
      continue;
    }

    const normalized = normalizeArticleUrl(article.url);

    if (normalized === null) {
      rejectedCount += 1;
      continue;
    }

    if (excludedCanonicalUrls.has(normalized.canonicalUrl)) {
      rejectedCount += 1;
      continue;
    }

    if (seenCanonicalUrls.has(normalized.canonicalUrl)) {
      rejectedCount += 1;
      continue;
    }

    seenCanonicalUrls.add(normalized.canonicalUrl);

    candidates.push({
      url: normalized.url,
      canonicalUrl: normalized.canonicalUrl,
      title: boundedText(article.title, MAX_TITLE_LENGTH),
      publisherName: boundedText(article.publisher?.name, MAX_PUBLISHER_LENGTH),
      publishedAt: parsePublishedAt(article.publishedAt),
      excerpt: boundedText(article.summary, MAX_EXCERPT_LENGTH),
    });
  }

  return {
    candidates,
    rejectedCount,
  };
}

function registrationMatches(
  candidates: readonly ResearchObservedSearchCandidate[],
  registered: readonly ResearchSource[],
): boolean {
  if (registered.length !== candidates.length) {
    return false;
  }

  const sourceIds = new Set<string>();

  for (const [index, source] of registered.entries()) {
    const candidate = candidates[index];

    if (
      candidate === undefined ||
      source.canonicalUrl !== candidate.canonicalUrl ||
      source.url !== candidate.url ||
      sourceIds.has(source.sourceId)
    ) {
      return false;
    }

    sourceIds.add(source.sourceId);
  }

  return true;
}

function toSourceView(
  source: ResearchSource,
): Extract<ResearchSearchResult, { status: 'ok' }>['sources'][number] {
  return {
    sourceId: source.sourceId,
    title: boundedText(source.title, MAX_TITLE_LENGTH),
    publisherName: boundedText(source.publisherName, MAX_PUBLISHER_LENGTH),
    publishedAt: source.publishedAt?.toISOString() ?? null,
    excerpt: null,
  };
}

function boundedText(value: string | null | undefined, maxLength: number): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = value.replace(/\s+/gu, ' ').trim();

  if (normalized.length === 0) {
    return null;
  }

  return normalized.slice(0, maxLength);
}

function parsePublishedAt(value: string | undefined): Date | null {
  if (value === undefined) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function validateLimit(value: number): number {
  if (!Number.isInteger(value) || value <= 0 || value > MAX_TOOL_RESULTS) {
    throw new Error(`Research search limit must be between 1 and ${MAX_TOOL_RESULTS}.`);
  }

  return value;
}

function mapSearchFailure(error: unknown): ResearchSearchResult {
  if (!(error instanceof GNewsError)) {
    return createResearchToolError('tool-failed');
  }

  switch (error.kind) {
    case 'timeout':
      return createResearchToolError('timeout');

    case 'network':
      return createResearchToolError('unavailable');

    case 'http':
      if (error.statusCode === 429) {
        return createResearchToolError('rate-limited');
      }

      if (error.statusCode === 502 || error.statusCode === 503 || error.statusCode === 504) {
        return createResearchToolError('unavailable');
      }

      return createResearchToolError('tool-failed');

    case 'invalid-json':
    case 'invalid-response':
      return createResearchToolError('invalid-result');
  }
}
