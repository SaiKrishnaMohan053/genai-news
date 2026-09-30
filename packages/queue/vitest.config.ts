import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@genai-news/schemas': fileURLToPath(new URL('../schemas/src/index.ts', import.meta.url)),
    },
  },

  test: {
    include: ['tests/**/*.test.ts'],
  },
});
