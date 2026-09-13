import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Vitest does not read tsconfig `paths`, so the `@/` alias that Next and tsc
 * resolve has to be declared again here. Without it, any module reached by a
 * test that imports through `@/` fails to load -- and a test file that cannot
 * load reports zero tests rather than failed tests, so the summary line still
 * says every test passed.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
