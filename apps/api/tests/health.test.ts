import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';

describe('health routes', () => {
  const app = buildApp({
    logger: false,
  });

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns API liveness', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health/live',
    });

    expect(response.statusCode).toBe(200);

    expect(response.json()).toEqual({
      status: 'ok',
      service: 'api',
    });
  });

  it('returns not ready when database is unavailable', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health/ready',
    });

    expect(response.statusCode).toBe(503);

    expect(response.json()).toEqual({
      status: 'not_ready',
      service: 'api',
      dependencies: {
        database: 'unavailable',
      },
    });
  });

  it('returns a structured 404 response', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/does-not-exist',
    });

    expect(response.statusCode).toBe(404);

    expect(response.json()).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Route GET /does-not-exist not found',
      },
    });
  });
});
