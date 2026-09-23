import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = fileURLToPath(new URL('./src', import.meta.url));

/**
 * One project, `unit`, like every package (`vitest run --project unit`).
 *
 * `@tarojs/taro` and `@tarojs/components` are aliased to a small fake runtime in
 * `src/test/taro-fake/` (why: see the header of `taro.ts`). The real packages are never loaded
 * in a test.
 */
export default defineConfig({
  test: {
    projects: [
      {
        oxc: { jsx: { runtime: 'automatic' } },
        resolve: {
          alias: [
            { find: /^@tarojs\/taro$/, replacement: `${src}/test/taro-fake/taro.ts` },
            { find: /^@tarojs\/components$/, replacement: `${src}/test/taro-fake/components.tsx` },
            { find: /^@\//, replacement: `${src}/` },
          ],
        },
        css: { modules: { generateScopedName: '[local]' } },
        test: {
          name: 'unit',
          root: fileURLToPath(new URL('.', import.meta.url)),
          environment: 'happy-dom',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          exclude: ['**/node_modules/**', '**/dist/**'],
          setupFiles: ['src/test/setup.ts'],
        },
      },
    ],
  },
});
