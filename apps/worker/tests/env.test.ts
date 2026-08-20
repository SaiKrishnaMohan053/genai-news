import { describe, expect, it } from 'vitest';

import { loadWorkerEnv } from '../src/config/env.js';

const baseEnv = {
  REDIS_URL: 'redis://localhost:6379',
};

describe('worker environment configuration', () => {
  it('uses defaults', () => {
    expect(loadWorkerEnv(baseEnv)).toEqual({
      NODE_ENV: 'development',
      REDIS_URL: 'redis://localhost:6379',
      LOG_LEVEL: 'info',
      OTEL_ENABLED: false,
    });
  });

  it('rejects missing Redis URL', () => {
    expect(() => loadWorkerEnv({})).toThrow('Invalid worker environment configuration');
  });

  it('rejects invalid Redis URL', () => {
    expect(() =>
      loadWorkerEnv({
        REDIS_URL: 'invalid',
      }),
    ).toThrow('Invalid worker environment configuration');
  });

  it('parses enabled telemetry', () => {
    const env = loadWorkerEnv({
      ...baseEnv,
      OTEL_ENABLED: 'true',
    });

    expect(env.OTEL_ENABLED).toBe(true);
  });
});
