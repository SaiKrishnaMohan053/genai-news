import type { NewsSource } from '@genai-news/shared';
import { GNewsSource } from '@genai-news/tools';

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
}

export function createNewsSourceRegistry(options: NewsSourceRegistryOptions): NewsSourceRegistry {
  const sources = new Map<string, NewsSource>([
    [
      'gnews',
      new GNewsSource({
        apiKey: options.gnewsApiKey,
      }),
    ],
  ]);

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
