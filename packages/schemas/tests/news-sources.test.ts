import { describe, expect, it } from 'vitest';

import { rssSourceConfigsJsonSchema, rssSourceConfigsSchema } from '../src/news-sources.js';

describe('RSS source configuration', () => {
  it('accepts configured RSS sources', () => {
    expect(
      rssSourceConfigsSchema.parse([
        {
          id: 'rss-openai',
          name: 'OpenAI News',
          feedUrl: 'https://example.com/feed.xml',
        },
      ]),
    ).toEqual([
      {
        id: 'rss-openai',
        name: 'OpenAI News',
        feedUrl: 'https://example.com/feed.xml',
      },
    ]);
  });

  it('parses RSS source configuration from JSON', () => {
    expect(
      rssSourceConfigsJsonSchema.parse(
        JSON.stringify([
          {
            id: 'rss-openai',
            name: 'OpenAI News',
            feedUrl: 'https://example.com/feed.xml',
          },
        ]),
      ),
    ).toEqual([
      {
        id: 'rss-openai',
        name: 'OpenAI News',
        feedUrl: 'https://example.com/feed.xml',
      },
    ]);
  });

  it('defaults to no configured RSS sources', () => {
    expect(rssSourceConfigsJsonSchema.parse(undefined)).toEqual([]);
  });

  it('rejects malformed JSON', () => {
    expect(() => rssSourceConfigsJsonSchema.parse('{invalid')).toThrow();
  });

  it('rejects duplicate source ids', () => {
    expect(() =>
      rssSourceConfigsSchema.parse([
        {
          id: 'rss-openai',
          name: 'OpenAI News',
          feedUrl: 'https://example.com/feed.xml',
        },
        {
          id: 'rss-openai',
          name: 'Duplicate',
          feedUrl: 'https://example.org/feed.xml',
        },
      ]),
    ).toThrow();
  });

  it('rejects the reserved gnews source id', () => {
    expect(() =>
      rssSourceConfigsSchema.parse([
        {
          id: 'gnews',
          name: 'Invalid',
          feedUrl: 'https://example.com/feed.xml',
        },
      ]),
    ).toThrow();
  });

  it('rejects unsupported feed URL protocols', () => {
    expect(() =>
      rssSourceConfigsSchema.parse([
        {
          id: 'rss-openai',
          name: 'OpenAI News',
          feedUrl: 'ftp://example.com/feed.xml',
        },
      ]),
    ).toThrow();
  });

  it('rejects feed URLs containing credentials', () => {
    expect(() =>
      rssSourceConfigsSchema.parse([
        {
          id: 'rss-openai',
          name: 'OpenAI News',
          feedUrl: 'https://user:password@example.com/feed.xml',
        },
      ]),
    ).toThrow();
  });
});
