import { describe, expect, it } from 'vitest';

import { createUuidStoryIdFactory } from '../src/news/story-clustering/index.js';

describe('story id factory', () => {
  it('creates non-empty unique story ids', () => {
    const factory = createUuidStoryIdFactory();

    const first = factory.createStoryId();

    const second = factory.createStoryId();

    expect(first.length).toBeGreaterThan(0);

    expect(second.length).toBeGreaterThan(0);

    expect(first).not.toBe(second);
  });
});
