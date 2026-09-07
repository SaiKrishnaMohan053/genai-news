import type { NewsSource } from '@genai-news/shared';
import type { RssSourceConfig } from '@genai-news/schemas';
import { GNewsSource, RssSource } from '@genai-news/tools';

export class UnsupportedNewsSourceError extends Error {
  readonly sourceId: string;

  constructor(sourceId: string) {
    super(`Unsupported news source: ${sourceId}`);

    this.name = 'UnsupportedNewsSourceError';
    this.sourceId = sourceId;
  }
}

export interface NewsSourceRegistry {
  get(sourceId: string): NewsSource;
}

export interface NewsSourceRegistryOptions {
  gnewsApiKey: string;
  rssSources?: readonly RssSourceConfig[];
  rssFetchImpl?: typeof fetch;
}

export function createNewsSourceRegistry(options: NewsSourceRegistryOptions): NewsSourceRegistry {
  const sources = new Map<string, NewsSource>();

  sources.set(
    'gnews',
    new GNewsSource({
      apiKey: options.gnewsApiKey,
    }),
  );

  for (const config of options.rssSources ?? []) {
    sources.set(
      config.id,
      new RssSource({
        id: config.id,
        name: config.name,
        feedUrl: config.feedUrl,
        ...(options.rssFetchImpl
          ? {
              fetchImpl: options.rssFetchImpl,
            }
          : {}),
      }),
    );
  }

  return {
    get(sourceId: string): NewsSource {
      const source = sources.get(sourceId);

      if (!source) {
        throw new UnsupportedNewsSourceError(sourceId);
      }

      return source;
    },
  };
}
