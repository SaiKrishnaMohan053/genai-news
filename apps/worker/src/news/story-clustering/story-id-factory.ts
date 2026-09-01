import {
  randomUUID,
} from 'node:crypto';

import type {
  StoryId,
} from '@genai-news/shared';

import type {
  StoryIdFactory,
} from './story-clustering-service.js';

export function createUuidStoryIdFactory():
  StoryIdFactory {
  return {
    createStoryId() {
      return randomUUID() as StoryId;
    },
  };
}