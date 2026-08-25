import {
  sourceArticleSchema,
  type ArticlePublisher,
  type NewsSource,
  type NewsSourceResult,
  type SourceArticle,
} from '@genai-news/shared';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

import { RssError } from './rss-error.js';

const DEFAULT_TIMEOUT_MS = 10_000;

type FetchLike = typeof fetch;

export type RssSourceOptions = {
  id: string;
  name: string;
  feedUrl: string;

  publisher?: ArticlePublisher;

  timeoutMs?: number;
  fetchImpl?: FetchLike;
};

export class RssSource implements NewsSource {
  readonly id: string;
  readonly name: string;
  readonly type = 'rss' as const;

  private readonly feedUrl: string;
  private readonly publisher: ArticlePublisher | undefined;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(options: RssSourceOptions) {
    this.id = requireNonBlank(options.id, 'RSS source id');
    this.name = requireNonBlank(options.name, 'RSS source name');

    const feedUrl = validateFeedUrl(options.feedUrl);

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      throw new Error('RSS timeout must be a positive integer.');
    }

    this.feedUrl = feedUrl;
    this.publisher = options.publisher;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async fetchLatest(input: { limit: number }): Promise<NewsSourceResult> {
    if (!Number.isInteger(input.limit) || input.limit <= 0) {
      throw new Error('RSS fetch limit must be a positive integer.');
    }

    let response: Response;

    try {
      response = await this.fetchImpl(this.feedUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw new RssError({
          kind: 'timeout',
          message: `RSS request timed out after ${this.timeoutMs}ms.`,
          cause: error,
        });
      }

      throw new RssError({
        kind: 'network',
        message: 'RSS request failed before receiving a response.',
        cause: error,
      });
    }

    if (!response.ok) {
      throw new RssError({
        kind: 'http',
        statusCode: response.status,
        message: `RSS request failed with HTTP ${response.status}.`,
      });
    }

    const xml = await response.text();

    const validation = XMLValidator.validate(xml);

    if (validation !== true) {
      throw new RssError({
        kind: 'invalid-xml',
        message: 'RSS source returned malformed XML.',
        cause: validation,
      });
    }

    let parsed: unknown;

    try {
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        trimValues: false,
      });

      parsed = parser.parse(xml);
    } catch (error) {
      throw new RssError({
        kind: 'invalid-xml',
        message: 'RSS source XML could not be parsed.',
        cause: error,
      });
    }

    const articles = parseFeed(parsed, this.publisher).slice(0, input.limit);

    return {
      source: {
        id: this.id,
        name: this.name,
        type: this.type,
      },
      fetchedAt: new Date(),
      articles,
    };
  }
}

function parseFeed(
  parsed: unknown,
  configuredPublisher: ArticlePublisher | undefined,
): SourceArticle[] {
  if (!isRecord(parsed)) {
    throw invalidFeed();
  }

  if ('rss' in parsed) {
    return parseRss(parsed.rss, configuredPublisher);
  }

  if ('feed' in parsed) {
    return parseAtom(parsed.feed, configuredPublisher);
  }

  throw invalidFeed();
}

function parseRss(
  rssValue: unknown,
  configuredPublisher: ArticlePublisher | undefined,
): SourceArticle[] {
  if (!isRecord(rssValue) || !isRecord(rssValue.channel)) {
    throw invalidFeed();
  }

  const channel = rssValue.channel;

  const feedPublisher = configuredPublisher ?? createPublisher(readString(channel.title));

  return toArray(channel.item)
    .map((item) => mapRssItem(item, feedPublisher))
    .filter((article): article is SourceArticle => article !== null);
}

function mapRssItem(value: unknown, publisher: ArticlePublisher | undefined): SourceArticle | null {
  if (!isRecord(value)) {
    return null;
  }

  const externalId = readRssGuid(value.guid);
  const title = readString(value.title);
  const url = readString(value.link);
  const publishedAt = readFirstString(value.pubDate, value['dc:date']);
  const author = readFirstString(value.author, value['dc:creator']);
  const summary = readFirstString(value.description, value.summary);
  const category = readCategory(value.category);

  const mapped: SourceArticle = {
    ...(externalId !== undefined ? { externalId } : {}),
    ...(title !== undefined ? { title } : {}),
    ...(url !== undefined ? { url } : {}),
    ...(publishedAt !== undefined ? { publishedAt } : {}),
    ...(author !== undefined ? { author } : {}),
    ...(summary !== undefined ? { summary } : {}),
    ...(category !== undefined ? { category } : {}),
    ...(publisher !== undefined ? { publisher } : {}),

    metadata: {
      feedFormat: 'rss',
    },
  };

  sourceArticleSchema.parse(mapped);

  return mapped;
}

function parseAtom(
  feedValue: unknown,
  configuredPublisher: ArticlePublisher | undefined,
): SourceArticle[] {
  if (!isRecord(feedValue)) {
    throw invalidFeed();
  }

  const feedPublisher = configuredPublisher ?? createPublisher(readString(feedValue.title));

  return toArray(feedValue.entry)
    .map((entry) => mapAtomEntry(entry, feedPublisher))
    .filter((article): article is SourceArticle => article !== null);
}

function mapAtomEntry(
  value: unknown,
  publisher: ArticlePublisher | undefined,
): SourceArticle | null {
  if (!isRecord(value)) {
    return null;
  }

  const externalId = readString(value.id);
  const title = readString(value.title);
  const url = readAtomLink(value.link);

  const publishedAt = readFirstString(value.published, value.updated);
  const author = readAtomAuthor(value.author);
  const summary = readFirstString(value.summary, value.content);
  const category = readAtomCategory(value.category);

  const mapped: SourceArticle = {
    ...(externalId !== undefined ? { externalId } : {}),
    ...(title !== undefined ? { title } : {}),
    ...(url !== undefined ? { url } : {}),
    ...(publishedAt !== undefined ? { publishedAt } : {}),
    ...(author !== undefined ? { author } : {}),
    ...(summary !== undefined ? { summary } : {}),
    ...(category !== undefined ? { category } : {}),
    ...(publisher !== undefined ? { publisher } : {}),

    metadata: {
      feedFormat: 'atom',
    },
  };

  sourceArticleSchema.parse(mapped);

  return mapped;
}

function readRssGuid(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return cleanString(value);
  }

  if (!isRecord(value)) {
    return undefined;
  }

  return readFirstString(value['#text'], value.__cdata);
}

function readAtomLink(value: unknown): string | undefined {
  for (const candidate of toArray(value)) {
    if (typeof candidate === 'string') {
      const link = cleanString(candidate);

      if (link !== undefined) {
        return link;
      }

      continue;
    }

    if (!isRecord(candidate)) {
      continue;
    }

    const href = readString(candidate['@_href']);

    if (href === undefined) {
      continue;
    }

    const rel = readString(candidate['@_rel']);

    if (rel === undefined || rel === 'alternate') {
      return href;
    }
  }

  return undefined;
}

function readAtomAuthor(value: unknown): string | undefined {
  const first = toArray(value)[0];

  if (typeof first === 'string') {
    return cleanString(first);
  }

  if (!isRecord(first)) {
    return undefined;
  }

  return readString(first.name);
}

function readCategory(value: unknown): string | undefined {
  for (const candidate of toArray(value)) {
    if (typeof candidate === 'string') {
      const category = cleanString(candidate);

      if (category !== undefined) {
        return category;
      }
    }
  }

  return undefined;
}

function readAtomCategory(value: unknown): string | undefined {
  for (const candidate of toArray(value)) {
    if (typeof candidate === 'string') {
      const category = cleanString(candidate);

      if (category !== undefined) {
        return category;
      }

      continue;
    }

    if (isRecord(candidate)) {
      const term = readString(candidate['@_term']);

      if (term !== undefined) {
        return term;
      }
    }
  }

  return undefined;
}

function createPublisher(name: string | undefined): ArticlePublisher | undefined {
  if (name === undefined) {
    return undefined;
  }

  return {
    name,
  };
}

function readString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return cleanString(value);
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (!isRecord(value)) {
    return undefined;
  }

  return readFirstString(value['#text'], value.__cdata);
}

function readFirstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const result = readString(value);

    if (result !== undefined) {
      return result;
    }
  }

  return undefined;
}

function cleanString(value: string): string | undefined {
  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

function toArray(value: unknown): unknown[] {
  if (value === undefined || value === null) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNonBlank(value: string, field: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`${field} must not be empty.`);
  }

  return trimmed;
}

function validateFeedUrl(value: string): string {
  let url: URL;

  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('RSS feed URL must be a valid URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('RSS feed URL must use HTTP or HTTPS.');
  }

  if (url.username || url.password) {
    throw new Error('RSS feed URL must not contain credentials.');
  }

  return url.toString();
}

function invalidFeed(): RssError {
  return new RssError({
    kind: 'invalid-feed',
    message: 'XML document is not a supported RSS or Atom feed.',
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}
