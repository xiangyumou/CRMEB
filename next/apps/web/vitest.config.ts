import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = import.meta.dirname;
const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) };
const serverTests = ['src/server/**/*.test.ts', 'app/**/route.test.ts'];
const intTests = ['src/**/*.int.test.ts', 'app/**/*.int.test.ts'];
const exclude = ['**/node_modules/**', '**/.next/**'];

/**
 * Three projects, named like the shared preset so `--project unit|int` means the same here:
 *
 *   unit         admin UI, happy-dom
 *   unit-server  `src/server` and route handlers, node
 *   int          anything needing PostgreSQL/Redis, through the @shop/testing harness
 */
export default defineConfig({
  test: {
    // Non-project options: each int file gets its own cloned database, but a 2-core box
    // should not fork ten postgres clients.
    pool: 'forks',
    maxWorkers: 4,
    teardownTimeout: 60_000,
    projects: [
      {
        // `tsconfig.json` sets `jsx: preserve` for Next; vitest's oxc transform has to be
        // told to compile JSX instead.
        oxc: { jsx: { runtime: 'automatic' } },
        resolve: { alias },
        test: {
          name: 'unit',
          root: here,
          environment: 'happy-dom',
          globals: true,
          setupFiles: ['./src/test/setup.ts'],
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'app/**/*.test.tsx'],
          exclude: [...exclude, ...serverTests, ...intTests],
          css: false,
          restoreMocks: true,
          // A full antd form render is ~1 s idle and 5–6 s when a dozen
          // executors share the box; a timeout here would only report load.
          testTimeout: 20_000,
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'unit-server',
          root: here,
          environment: 'node',
          include: serverTests,
          exclude: [...exclude, ...intTests],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'int',
          root: here,
          environment: 'node',
          include: intTests,
          exclude,
          testTimeout: 30_000,
          hookTimeout: 180_000,
          globalSetup: [path.resolve(here, '../../packages/testing/src/harness/global-setup.ts')],
        },
      },
    ],
  },
});
