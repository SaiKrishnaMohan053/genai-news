import { describe, expect, it } from 'vitest';

import { loadEnv } from '../src/config/env.js';

describe('environment configuration', () => {
  it('uses defaults for optional configuration', () => {
    const env = loadEnv({});

    expect(env).toEqual({
      NODE_ENV: 'development',
      API_HOST: '0.0.0.0',
      API_PORT: 3001,
      LOG_LEVEL: 'info',
    });
  });

  it('parses a valid API port', () => {
    const env = loadEnv({
      API_PORT: '4000',
    });

    expect(env.API_PORT).toBe(4000);
  });

  it('rejects an invalid API port', () => {
    expect(() =>
      loadEnv({
        API_PORT: 'not-a-number',
      }),
    ).toThrow('Invalid environment configuration');
  });

  it('rejects an invalid environment', () => {
    expect(() =>
      loadEnv({
        NODE_ENV: 'invalid',
      }),
    ).toThrow('Invalid environment configuration');
  });
});
