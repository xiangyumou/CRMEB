import path from 'node:path';
import { shopVitest } from '@shop/config/vitest';

const here = import.meta.dirname;
const repo = path.resolve(here, '../..');

/**
 * `@shop/testing` also runs the tests for `apps/web/src/server`.
 *
 * TEMPORARY (P0-A): `apps/web` has no package.json yet — P0-B owns it — so
 * nothing there can resolve `@shop/*` or `zod` on its own. Until P0-B adds the
 * dependencies listed in `docs/rewrite/status/p0a.md`, the aliases below stand
 * in, and these two extra projects keep `handle()` covered. When the app has
 * its own package.json, delete the `web-server-*` projects and the aliases and
 * give apps/web the normal `shopVitest({ dirname })` config.
 *
 * The aliases are regexes, not prefixes: a plain `'@shop/db'` string alias
 * would also swallow `@shop/db/schema/system`.
 */
const webServerRoot = path.resolve(repo, 'apps/web');

const pkg = (relative: string) => path.resolve(repo, relative);

const alias = [
  { find: /^@shop\/contracts$/, replacement: pkg('packages/contracts/src/index.ts') },
  {
    find: /^@shop\/contracts\/conventions$/,
    replacement: pkg('packages/contracts/src/_conventions/index.ts'),
  },
  { find: /^@shop\/contracts\/routes$/, replacement: pkg('packages/contracts/src/routes.gen.ts') },
  { find: /^@shop\/contracts\/errors$/, replacement: pkg('packages/contracts/src/errors.gen.ts') },
  { find: /^@shop\/contracts\/(.+)$/, replacement: `${pkg('packages/contracts/src')}/$1.ts` },
  { find: /^@shop\/core$/, replacement: pkg('packages/core/src/index.ts') },
  { find: /^@shop\/core\/kernel$/, replacement: pkg('packages/core/src/kernel/index.ts') },
  { find: /^@shop\/core\/auth$/, replacement: pkg('packages/core/src/auth/index.ts') },
  { find: /^@shop\/core\/effects$/, replacement: pkg('packages/core/src/effects/index.ts') },
  { find: /^@shop\/core\/(.+)$/, replacement: `${pkg('packages/core/src')}/$1.ts` },
  { find: /^@shop\/db$/, replacement: pkg('packages/db/src/index.ts') },
  { find: /^@shop\/db\/(.+)$/, replacement: `${pkg('packages/db/src')}/$1.ts` },
  { find: /^@shop\/testing$/, replacement: pkg('packages/testing/src/index.ts') },
  { find: /^zod$/, replacement: pkg('packages/contracts/node_modules/zod') },
  { find: /^ioredis$/, replacement: pkg('packages/core/node_modules/ioredis') },
  { find: /^pg$/, replacement: pkg('packages/db/node_modules/pg') },
  { find: /^bullmq$/, replacement: pkg('packages/core/node_modules/bullmq') },
  { find: /^pino$/, replacement: pkg('packages/core/node_modules/pino') },
  { find: /^bcryptjs$/, replacement: pkg('packages/core/node_modules/bcryptjs') },
  { find: /^drizzle-orm$/, replacement: pkg('packages/core/node_modules/drizzle-orm') },
  {
    find: /^drizzle-orm\/(.+)$/,
    replacement: `${pkg('packages/core/node_modules/drizzle-orm')}/$1`,
  },
];

const globalSetup = path.resolve(here, 'src/harness/global-setup.ts');

export default shopVitest({
  dirname: here,
  intGlobalSetup: globalSetup,
  extraProjects: [
    {
      resolve: { alias },
      test: {
        name: 'web-server-unit',
        root: webServerRoot,
        environment: 'node',
        include: ['src/server/**/*.test.ts', 'app/**/*.test.ts'],
        exclude: ['**/node_modules/**', '**/*.int.test.ts'],
      },
    },
    {
      resolve: { alias },
      test: {
        name: 'web-server-int',
        root: webServerRoot,
        environment: 'node',
        include: ['src/server/**/*.int.test.ts', 'app/**/*.int.test.ts'],
        exclude: ['**/node_modules/**'],
        testTimeout: 30_000,
        hookTimeout: 180_000,
        teardownTimeout: 60_000,
        pool: 'forks',
        maxWorkers: 4,
        minWorkers: 1,
        globalSetup: [globalSetup],
      },
    },
  ],
});
