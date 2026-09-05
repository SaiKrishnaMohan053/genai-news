import { describe, expect, it } from 'vitest';

import { loadWorkerEnv } from '../src/config/env.js';

const validDiscoveryEnv = {
  REDIS_URL: 'redis://localhost:6379',

  DATABASE_URL: 'postgresql://genai_news:genai_news@localhost:5432/genai_news',

  GNEWS_API_KEY: 'test-gnews-api-key',

  OPENAI_API_KEY: 'test-openai-api-key',
};

describe('worker environment configuration', () => {
  it('uses defaults', () => {
    const env = loadWorkerEnv({
      ...validDiscoveryEnv,
    });

    expect(env).toEqual({
      NODE_ENV: 'development',

      REDIS_URL: 'redis://localhost:6379',

      DATABASE_URL: 'postgresql://genai_news:genai_news@localhost:5432/genai_news',

      GNEWS_API_KEY: 'test-gnews-api-key',

      NEWS_FRESHNESS_HOURS: 24,

      NEWS_MAX_FUTURE_SKEW_MINUTES: 5,

      OPENAI_API_KEY: 'test-openai-api-key',

      STORY_EMBEDDING_MODEL: 'text-embedding-3-small',

      STORY_CANDIDATE_WINDOW_HOURS: 24,

      STORY_INCLUDE_UNKNOWN_TIME: false,

      WORKER_HEALTH_HOST: '0.0.0.0',

      WORKER_HEALTH_PORT: 3002,

      LOG_LEVEL: 'info',

      OTEL_ENABLED: false,
    });
  });

  it('accepts a valid discovery and clustering configuration', () => {
    const env = loadWorkerEnv({
      ...validDiscoveryEnv,

      NEWS_FRESHNESS_HOURS: '48',

      NEWS_MAX_FUTURE_SKEW_MINUTES: '10',

      STORY_EMBEDDING_MODEL: 'text-embedding-3-small',

      STORY_CANDIDATE_WINDOW_HOURS: '36',

      STORY_INCLUDE_UNKNOWN_TIME: 'true',
    });

    expect(env.DATABASE_URL).toBe('postgresql://genai_news:genai_news@localhost:5432/genai_news');

    expect(env.GNEWS_API_KEY).toBe('test-gnews-api-key');

    expect(env.OPENAI_API_KEY).toBe('test-openai-api-key');

    expect(env.NEWS_FRESHNESS_HOURS).toBe(48);

    expect(env.NEWS_MAX_FUTURE_SKEW_MINUTES).toBe(10);

    expect(env.STORY_EMBEDDING_MODEL).toBe('text-embedding-3-small');

    expect(env.STORY_CANDIDATE_WINDOW_HOURS).toBe(36);

    expect(env.STORY_INCLUDE_UNKNOWN_TIME).toBe(true);
  });

  it('rejects missing Redis URL', () => {
    expect(() =>
      loadWorkerEnv({
        DATABASE_URL: validDiscoveryEnv.DATABASE_URL,

        GNEWS_API_KEY: validDiscoveryEnv.GNEWS_API_KEY,

        OPENAI_API_KEY: validDiscoveryEnv.OPENAI_API_KEY,
      }),
    ).toThrow('Invalid worker environment configuration');
  });

  it('rejects invalid Redis URL', () => {
    expect(() =>
      loadWorkerEnv({
        ...validDiscoveryEnv,

        REDIS_URL: 'not-a-url',
      }),
    ).toThrow('Invalid worker environment configuration');
  });

  it('rejects missing database URL', () => {
    expect(() =>
      loadWorkerEnv({
        REDIS_URL: validDiscoveryEnv.REDIS_URL,

        GNEWS_API_KEY: validDiscoveryEnv.GNEWS_API_KEY,

        OPENAI_API_KEY: validDiscoveryEnv.OPENAI_API_KEY,
      }),
    ).toThrow('Invalid worker environment configuration');
  });

  it('rejects an invalid database URL', () => {
    expect(() =>
      loadWorkerEnv({
        ...validDiscoveryEnv,

        DATABASE_URL: 'not-a-url',
      }),
    ).toThrow('Invalid worker environment configuration');
  });

  it('rejects a missing GNews API key', () => {
    expect(() =>
      loadWorkerEnv({
        REDIS_URL: validDiscoveryEnv.REDIS_URL,

        DATABASE_URL: validDiscoveryEnv.DATABASE_URL,

        OPENAI_API_KEY: validDiscoveryEnv.OPENAI_API_KEY,
      }),
    ).toThrow('Invalid worker environment configuration');
  });

  it('rejects an empty GNews API key', () => {
    expect(() =>
      loadWorkerEnv({
        ...validDiscoveryEnv,

        GNEWS_API_KEY: '',
      }),
    ).toThrow('Invalid worker environment configuration');
  });

  it('rejects a whitespace-only GNews API key', () => {
    expect(() =>
      loadWorkerEnv({
        ...validDiscoveryEnv,

        GNEWS_API_KEY: '   ',
      }),
    ).toThrow('Invalid worker environment configuration');
  });

  it('rejects a missing OpenAI API key', () => {
    expect(() =>
      loadWorkerEnv({
        REDIS_URL: validDiscoveryEnv.REDIS_URL,

        DATABASE_URL: validDiscoveryEnv.DATABASE_URL,

        GNEWS_API_KEY: validDiscoveryEnv.GNEWS_API_KEY,
      }),
    ).toThrow('Invalid worker environment configuration');
  });

  it('rejects a whitespace-only OpenAI API key', () => {
    expect(() =>
      loadWorkerEnv({
        ...validDiscoveryEnv,

        OPENAI_API_KEY: '   ',
      }),
    ).toThrow('Invalid worker environment configuration');
  });

  it('rejects invalid freshness hours', () => {
    for (const value of ['0', '-1', 'not-a-number']) {
      expect(() =>
        loadWorkerEnv({
          ...validDiscoveryEnv,

          NEWS_FRESHNESS_HOURS: value,
        }),
      ).toThrow('Invalid worker environment configuration');
    }
  });

  it('rejects negative future skew', () => {
    expect(() =>
      loadWorkerEnv({
        ...validDiscoveryEnv,

        NEWS_MAX_FUTURE_SKEW_MINUTES: '-1',
      }),
    ).toThrow('Invalid worker environment configuration');
  });

  it('allows zero future skew', () => {
    const env = loadWorkerEnv({
      ...validDiscoveryEnv,

      NEWS_MAX_FUTURE_SKEW_MINUTES: '0',
    });

    expect(env.NEWS_MAX_FUTURE_SKEW_MINUTES).toBe(0);
  });

  it('rejects an empty embedding model', () => {
    expect(() =>
      loadWorkerEnv({
        ...validDiscoveryEnv,

        STORY_EMBEDDING_MODEL: '   ',
      }),
    ).toThrow('Invalid worker environment configuration');
  });

  it('rejects invalid story candidate window hours', () => {
    for (const value of ['0', '-1', 'not-a-number']) {
      expect(() =>
        loadWorkerEnv({
          ...validDiscoveryEnv,

          STORY_CANDIDATE_WINDOW_HOURS: value,
        }),
      ).toThrow('Invalid worker environment configuration');
    }
  });

  it('rejects invalid unknown-time policy value', () => {
    expect(() =>
      loadWorkerEnv({
        ...validDiscoveryEnv,

        STORY_INCLUDE_UNKNOWN_TIME: 'yes',
      }),
    ).toThrow('Invalid worker environment configuration');
  });

  it('parses enabled telemetry', () => {
    const env = loadWorkerEnv({
      ...validDiscoveryEnv,

      OTEL_ENABLED: 'true',
    });

    expect(env.OTEL_ENABLED).toBe(true);
  });

  it('rejects invalid worker health port', () => {
    expect(() =>
      loadWorkerEnv({
        ...validDiscoveryEnv,

        WORKER_HEALTH_PORT: '70000',
      }),
    ).toThrow('Invalid worker environment configuration');
  });
});
