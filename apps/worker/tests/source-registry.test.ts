import { describe, expect, it } from 'vitest';

import {
  createNewsSourceRegistry,
  UnsupportedNewsSourceError,
} from '../src/news/source-registry.js';

describe('news source registry', () => {
  it('resolves GNews', () => {
    const registry = createNewsSourceRegistry({
      gnewsApiKey: 'test-key',
    });

    const source = registry.get('gnews');

    expect(source.id).toBe('gnews');
    expect(source.type).toBe('api');
  });

  it('resolves configured RSS sources', () => {
    const registry = createNewsSourceRegistry({
      gnewsApiKey: 'test-key',
      rssSources: [
        {
          id: 'rss-openai',
          name: 'OpenAI News',
          feedUrl: 'https://example.com/feed.xml',
        },
      ],
    });

    const source = registry.get('rss-openai');

    expect(source.id).toBe('rss-openai');
    expect(source.name).toBe('OpenAI News');
    expect(source.type).toBe('rss');
  });

  it('rejects unconfigured sources', () => {
    const registry = createNewsSourceRegistry({
      gnewsApiKey: 'test-key',
      rssSources: [
        {
          id: 'rss-openai',
          name: 'OpenAI News',
          feedUrl: 'https://example.com/feed.xml',
        },
      ],
    });

    expect(() => registry.get('rss-unknown')).toThrow(UnsupportedNewsSourceError);
  });
});
