import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@genai-news/agents': fileURLToPath(
        new URL('../../packages/agents/src/index.ts', import.meta.url),
      ),
      '@genai-news/database': fileURLToPath(
        new URL('../../packages/database/src/index.ts', import.meta.url),
      ),
      '@genai-news/observability': fileURLToPath(
        new URL('../../packages/observability/src/index.ts', import.meta.url),
      ),
      '@genai-news/queue': fileURLToPath(
        new URL('../../packages/queue/src/index.ts', import.meta.url),
      ),
      '@genai-news/schemas': fileURLToPath(
        new URL('../../packages/schemas/src/index.ts', import.meta.url),
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
    include: ['tests/**/*.test.ts'],
  },
});
