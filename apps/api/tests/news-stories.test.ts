import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';

describe('news story routes', () => {
  const app = buildApp({
    logger: false,
  });

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns unavailable when story storage is missing', async () => {
    const response = await app.inject({
      method: 'GET',

      url: '/api/news/stories',
    });

    expect(response.statusCode).toBe(503);

    expect(response.json()).toEqual({
      error: {
        code: 'STORY_STORAGE_UNAVAILABLE',

        message: 'Story storage is unavailable',
      },
    });
  });

  it('returns unavailable for story detail when storage is missing', async () => {
    const response = await app.inject({
      method: 'GET',

      url: '/api/news/stories/story-1',
    });

    expect(response.statusCode).toBe(503);

    expect(response.json()).toEqual({
      error: {
        code: 'STORY_STORAGE_UNAVAILABLE',

        message: 'Story storage is unavailable',
      },
    });
  });
});
