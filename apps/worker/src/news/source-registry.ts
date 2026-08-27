import type { NewsSource } from '@genai-news/shared';
import { GNewsSource } from '@genai-news/tools';

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
        throw new Error(`Unsupported news source: ${sourceId}`);
      }

      return source;
    },
  };
}
