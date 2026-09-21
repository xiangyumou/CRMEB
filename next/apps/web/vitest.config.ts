import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Local vitest config for P0-b. The orchestrator swaps this for the shared
 * preset in `@shop/config` at merge.
 *
 * No `@vitejs/plugin-react`: vitest 5 transforms `.tsx` with oxc, whose default
 * is the automatic JSX runtime, and tests do not need Fast Refresh.
 */
export default defineConfig({
  // `tsconfig.json` sets `jsx: preserve` for Next, which leaves JSX in the
  // output; vitest's oxc transform has to be told to compile it instead.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'app/**/*.test.tsx'],
    css: false,
    restoreMocks: true,
  },
});
