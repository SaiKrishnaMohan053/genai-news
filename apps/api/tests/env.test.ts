import { describe, expect, it } from 'vitest';

import { loadEnv } from '../src/config/env.js';

const baseEnv = {
  DATABASE_URL: 'postgresql://genai_news:genai_news_dev@localhost:5432/genai_news',
};

describe('environment configuration', () => {
  it('uses defaults for optional configuration', () => {
    const env = loadEnv(baseEnv);

    expect(env).toEqual({
      NODE_ENV: 'development',
      API_HOST: '0.0.0.0',
      API_PORT: 3001,
      LOG_LEVEL: 'info',
      DATABASE_URL: 'postgresql://genai_news:genai_news_dev@localhost:5432/genai_news',
    });
  });

  it('parses a valid API port', () => {
    const env = loadEnv({
      ...baseEnv,
      API_PORT: '4000',
    });

    expect(env.API_PORT).toBe(4000);
  });

  it('rejects an invalid API port', () => {
    expect(() =>
      loadEnv({
        ...baseEnv,
        API_PORT: 'not-a-number',
      }),
    ).toThrow('Invalid environment configuration');
  });

  it('rejects an invalid environment', () => {
    expect(() =>
      loadEnv({
        ...baseEnv,
        NODE_ENV: 'invalid',
      }),
    ).toThrow('Invalid environment configuration');
  });

  it('rejects a missing database URL', () => {
    expect(() => loadEnv({})).toThrow('Invalid environment configuration');
  });
});
