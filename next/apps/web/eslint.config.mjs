import js from '@eslint/js';
import next from 'eslint-config-next';

/**
 * Minimal local config for P0-b. The orchestrator replaces this with the shared
 * preset from `@shop/config` at merge (see docs/rewrite/status/p0b.md).
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
          patterns: [
            {
              group: ['@shop/core', '@shop/core/*', '@shop/db', '@shop/db/*'],
              message: '后台 UI 只能引用 @shop/contracts 与 src/admin 下的客户端，不能引用 core/db。',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: '页面不要直接 fetch，请使用 callRoute / useRouteQuery / useRouteMutation。' },
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
    // The client itself is the one place allowed to call fetch.
    files: ['src/admin/api/**', 'src/admin/notifications/**', 'src/admin/kit/**/stub*.ts'],
    rules: { 'no-restricted-globals': 'off' },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'src/test/**'],
    rules: { 'no-restricted-globals': 'off' },
  },
];
