import 'dotenv/config';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['integration-tests/**/*.test.ts'],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    sequence: {
      concurrent: false,
    },
  },
});
