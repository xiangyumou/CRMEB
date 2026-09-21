// TEMPORARY (P0-A): a config of its own for `apps/web/src/server` and the
// route files, because `apps/web` has no package.json yet — so `@shop/config`
// cannot be resolved by name from here and is imported by path.
//
// P0-B: when the app gets its own package.json, replace this with
//   import { shopConfig } from '@shop/config/eslint';
//   export default [
//     ...shopConfig({ kind: 'admin-ui', ignores: ['src/server/**', 'app/admin-api/**', 'app/api/**'] }),
//     ...shopConfig({ kind: 'app-server' }).map((c) => ({ ...c, files: ['src/server/**/*.ts', 'app/**/route.ts'] })),
//   ];
import { shopConfig } from '../../../../packages/config/eslint/index.js';

export default shopConfig({ kind: 'app-server' });
