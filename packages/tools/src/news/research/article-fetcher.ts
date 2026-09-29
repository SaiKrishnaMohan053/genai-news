import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { LookupFunction } from 'node:net';

import {
  ResearchUrlSafetyError,
  resolveSafeResearchUrl,
  type ResearchDnsLookup,
} from './url-safety.js';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_MAX_RESPONSE_BYTES = 1_000_000;
const DEFAULT_MAX_TEXT_LENGTH = 16_000;

const SUPPORTED_CONTENT_TYPES = new Set(['text/html', 'text/plain', 'application/xhtml+xml']);

const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

export type ResearchArticleFetchErrorKind =
  | 'blocked-url'
  | 'timeout'
  | 'unsupported-content'
  | 'response-too-large'
  | 'invalid-redirect'
  | 'http'
  | 'network';

export class ResearchArticleFetchError extends Error {
  constructor(
    readonly kind: ResearchArticleFetchErrorKind,
    readonly statusCode?: number,
  ) {
    super(`Research article fetch failed: ${kind}`);
    this.name = 'ResearchArticleFetchError';
  }
}

export type ResearchArticleTransportInput = Readonly<{
  url: string;
  address: string;
  family: 4 | 6;
  signal: AbortSignal;
  maxResponseBytes: number;
}>;

export type ResearchArticleTransportResponse = Readonly<{
  statusCode: number;
  headers: Readonly<Record<string, string | undefined>>;
  body: Uint8Array;
}>;

export interface ResearchArticleTransport {
  request(input: ResearchArticleTransportInput): Promise<ResearchArticleTransportResponse>;
}

export type FetchResearchArticleOptions = Readonly<{
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRedirects?: number;
  maxResponseBytes?: number;
  maxTextLength?: number;
  lookup?: ResearchDnsLookup;
  transport?: ResearchArticleTransport;
  now?: () => Date;
}>;

export type FetchedResearchArticle = Readonly<{
  finalUrl: string;
  canonicalUrl: string;
  text: string;
  fetchedAt: Date;
  truncated: boolean;
  redirectCount: number;
}>;

export async function fetchResearchArticle(
  sourceUrl: string,
  options: FetchResearchArticleOptions = {},
): Promise<FetchedResearchArticle> {
  const timeoutMs = requirePositiveInteger(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 'timeoutMs');
  const maxRedirects = requireNonnegativeInteger(
    options.maxRedirects ?? DEFAULT_MAX_REDIRECTS,
    'maxRedirects',
  );
  const maxResponseBytes = requirePositiveInteger(
    options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
    'maxResponseBytes',
  );
  const maxTextLength = requirePositiveInteger(
    options.maxTextLength ?? DEFAULT_MAX_TEXT_LENGTH,
    'maxTextLength',
  );

  const controller = new AbortController();
  let timedOut = false;

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const abortFromCaller = () => {
    controller.abort(options.signal?.reason);
  };

  options.signal?.addEventListener('abort', abortFromCaller, { once: true });

  if (options.signal?.aborted) {
    clearTimeout(timeout);
    options.signal.throwIfAborted();
  }

  const transport = options.transport ?? new NodePinnedArticleTransport();

  try {
    let currentUrl = sourceUrl;

    for (let redirectCount = 0; ; redirectCount += 1) {
      controller.signal.throwIfAborted();

      let safe;

      try {
        safe = await resolveSafeResearchUrl(currentUrl, {
          ...(options.lookup === undefined ? {} : { lookup: options.lookup }),
        });
      } catch (error) {
        if (error instanceof ResearchUrlSafetyError) {
          throw new ResearchArticleFetchError('blocked-url');
        }

        throw error;
      }

      const address = safe.addresses[0];

      if (address === undefined) {
        throw new ResearchArticleFetchError('blocked-url');
      }

      const family = address.includes(':') ? 6 : 4;

      const response = await transport.request({
        url: safe.url,
        address,
        family,
        signal: controller.signal,
        maxResponseBytes,
      });

      if (REDIRECT_STATUS_CODES.has(response.statusCode)) {
        if (redirectCount >= maxRedirects) {
          throw new ResearchArticleFetchError('invalid-redirect');
        }

        const location = response.headers.location;

        if (location === undefined) {
          throw new ResearchArticleFetchError('invalid-redirect');
        }

        let redirected: URL;

        try {
          redirected = new URL(location, safe.url);
        } catch {
          throw new ResearchArticleFetchError('invalid-redirect');
        }

        currentUrl = redirected.toString();
        continue;
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw new ResearchArticleFetchError('http', response.statusCode);
      }

      const contentType = normalizeContentType(response.headers['content-type']);

      if (contentType === null || !SUPPORTED_CONTENT_TYPES.has(contentType)) {
        throw new ResearchArticleFetchError('unsupported-content');
      }

      const decoded = new TextDecoder('utf-8', {
        fatal: false,
      }).decode(response.body);

      const extracted =
        contentType === 'text/plain' ? normalizeWhitespace(decoded) : extractHtmlText(decoded);

      if (extracted.length === 0) {
        throw new ResearchArticleFetchError('unsupported-content');
      }

      const truncated = extracted.length > maxTextLength;
      const text = extracted.slice(0, maxTextLength);

      return Object.freeze({
        finalUrl: safe.url,
        canonicalUrl: safe.canonicalUrl,
        text,
        fetchedAt: (options.now ?? (() => new Date()))(),
        truncated,
        redirectCount,
      });
    }
  } catch (error) {
    if (options.signal?.aborted) {
      options.signal.throwIfAborted();
    }

    if (timedOut) {
      throw new ResearchArticleFetchError('timeout');
    }

    if (error instanceof ResearchArticleFetchError) {
      throw error;
    }

    throw new ResearchArticleFetchError('network');
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abortFromCaller);
  }
}

export class NodePinnedArticleTransport implements ResearchArticleTransport {
  request(input: ResearchArticleTransportInput): Promise<ResearchArticleTransportResponse> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(input.url);

      const lookup: LookupFunction = (_hostname, _options, callback) => {
        callback(null, input.address, input.family);
      };

      const request = parsed.protocol === 'https:' ? httpsRequest : httpRequest;

      const req = request(
        parsed,
        {
          method: 'GET',
          headers: {
            Accept: 'text/html, application/xhtml+xml, text/plain;q=0.9',
            'User-Agent': 'genai-news-research/1.0',
          },
          lookup,
          signal: input.signal,
        },
        (response) => {
          const statusCode = response.statusCode ?? 0;
          const headers = normalizeHeaders(response.headers);

          if (REDIRECT_STATUS_CODES.has(statusCode)) {
            response.resume();

            resolve({
              statusCode,
              headers,
              body: new Uint8Array(),
            });

            return;
          }

          const contentLength = readContentLength(headers['content-length']);

          if (contentLength !== null && contentLength > input.maxResponseBytes) {
            response.destroy();
            reject(new ResearchArticleFetchError('response-too-large'));
            return;
          }

          const chunks: Buffer[] = [];
          let receivedBytes = 0;

          response.on('data', (chunk: Buffer | string) => {
            const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;

            receivedBytes += buffer.byteLength;

            if (receivedBytes > input.maxResponseBytes) {
              response.destroy(new ResearchArticleFetchError('response-too-large'));
              return;
            }

            chunks.push(buffer);
          });

          response.once('end', () => {
            resolve({
              statusCode,
              headers,
              body: Buffer.concat(chunks),
            });
          });

          response.once('error', reject);
        },
      );

      req.once('error', reject);
      req.end();
    });
  }
}

function normalizeHeaders(
  headers: IncomingHttpHeaders,
): Readonly<Record<string, string | undefined>> {
  const result: Record<string, string | undefined> = {};

  for (const [name, value] of Object.entries(headers)) {
    result[name.toLowerCase()] = Array.isArray(value) ? value[0] : value;
  }

  return result;
}

function normalizeContentType(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  const [mediaType] = value.split(';', 1);
  const normalized = mediaType?.trim().toLowerCase();

  return normalized ? normalized : null;
}

function readContentLength(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function extractHtmlText(html: string): string {
  return normalizeWhitespace(
    decodeBasicHtmlEntities(
      html
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, ' ')
        .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/giu, ' ')
        .replace(/<!--[\s\S]*?-->/gu, ' ')
        .replace(/<[^>]+>/gu, ' '),
    ),
  );
}

function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'");
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function requirePositiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return value;
}

function requireNonnegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative integer.`);
  }

  return value;
}
