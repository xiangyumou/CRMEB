import path from 'node:path';

import { shopVitest } from '@shop/config/vitest';

const here = import.meta.dirname;

/**
 * The int project needs the shared harness's PostgreSQL 17: an ETL integration
 * test that does not load into a real database with real constraints is only
 * testing the mappers again, and the mappers have their own unit tests.
 *
 * The MySQL side is a container this package starts inside the test file rather
 * than in `globalSetup`, because it is the only file that wants one and a
 * `pnpm test:int` across the workspace should not pay for a MySQL pull.
 */
export default shopVitest({
  dirname: here,
  alias: {
    '@shop/testing': path.resolve(here, '../testing/src/index.ts'),
  },
  intGlobalSetup: path.resolve(here, '../testing/src/harness/global-setup.ts'),
});
