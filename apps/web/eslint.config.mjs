import js from '@eslint/js';
import next from 'eslint-config-next';

const SERVER = ['src/server/**', 'app/admin-api/**', 'app/api/**'];

const NO_CORE_OR_DB = {
  group: ['@shop/core', '@shop/core/*', '@shop/db', '@shop/db/*'],
  message: '后台 UI 只能引用 @shop/contracts 与 src/admin 下的客户端，不能引用 core/db。',
};

/**
 * The page-decoration editor library is an implementation detail of
 * `src/admin/decor` (docs/mini/spikes/S3-decor.md): routes use `DecorEditor`,
 * so the library can be swapped by rewriting one folder.
 */
const NO_PUCK = {
  group: ['@puckeditor/*'],
  message:
    '装修编辑器库只能在 src/admin/decor 内使用；页面请用 @/admin/decor 与 @/admin/decor/editor。',
};

/**
 * Admin UI rules. `SERVER` files (the route binder and route handlers) are the one part of
 * this app allowed to import `@shop/core`; they must stay free of business logic instead.
 *
 * Type-aware linting is deliberately off: typescript-eslint 8.x declares a peer
 * range of `typescript <6.1.0` and this workspace is on TypeScript 7, so the
 * project service is not wired up. `pnpm typecheck` is the type gate.
 */
export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      'src/admin/menu/menu.gen.ts',
      '**/*.gen.ts',
      // JS/MJS config and tooling files: eslint-config-next declares `globals`
      // for them, and @typescript-eslint/scope-manager 8.70 has no `addGlobals`,
      // which ESLint 10 requires. Nothing here is application code.
      '**/*.mjs',
      '**/*.js',
      '**/*.cjs',
    ],
  },
  js.configs.recommended,
  ...next,
  {
    // Pin the React version: eslint-plugin-react 7.37's `detect` path calls
    // `context.getFilename()`, which ESLint 10 removed.
    settings: { react: { version: '19.3' } },
    rules: {
      // The admin UI must never reach into server-side packages.
      'no-restricted-imports': [
        'error',
        {
          patterns: [NO_CORE_OR_DB, NO_PUCK],
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message: '页面不要直接 fetch，请使用 callRoute / useRouteQuery / useRouteMutation。',
        },
      ],
      'react/no-unescaped-entities': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      '@next/next/no-img-element': 'off',
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // `tsc` already proves these; the lint pass is for style and hooks.
      'no-undef': 'off',
    },
  },
  {
    files: SERVER,
    rules: {
      'no-restricted-globals': 'off',
      // Same boundary as the shared `app-server` preset: handlers reach data through core.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@shop/db/schema/*'],
              message: 'route/server 层不得直接访问 Drizzle 表，走 core 的 *.repo.ts',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/admin/decor/**', 'app/admin/(shell)/decor/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [NO_CORE_OR_DB] }] },
  },
  {
    // The client itself is the one place allowed to call fetch.
    files: ['src/admin/api/**', 'src/admin/notifications/**', 'src/admin/kit/**/stub*.ts'],
    rules: { 'no-restricted-globals': 'off' },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'src/test/**'],
    rules: { 'no-restricted-globals': 'off' },
  },
  {
    // Tests assert on rows, so server tests may read tables directly.
    files: SERVER.map((glob) => `${glob}/*.test.ts`),
    rules: { 'no-restricted-imports': 'off' },
  },
];
