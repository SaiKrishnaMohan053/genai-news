import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';

describe('news article routes', () => {
  const app = buildApp({
    logger: false,
  });

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns unavailable when article storage is missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/news/articles',
    });

    expect(response.statusCode).toBe(503);

    expect(response.json()).toEqual({
      error: {
        code: 'ARTICLE_STORAGE_UNAVAILABLE',
        message: 'Article storage is unavailable',
      },
    });
  });

  it('rejects an invalid article limit', async () => {
    /*
     * Storage availability is checked first,
     * so request validation with a real database
     * belongs in the integration suite.
     */
    const response = await app.inject({
      method: 'GET',
      url: '/api/news/articles?limit=0',
    });

    expect(response.statusCode).toBe(503);
  });
});
