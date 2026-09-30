import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@genai-news/agents': fileURLToPath(
        new URL('../../packages/agents/src/index.ts', import.meta.url),
      ),

      '@genai-news/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),

      '@genai-news/tools': fileURLToPath(
        new URL('../../packages/tools/src/index.ts', import.meta.url),
      ),
    },
  },

  test: {
    include: ['integration-tests/**/*.test.ts'],
  },
});
