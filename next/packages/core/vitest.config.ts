import path from 'node:path';
import { shopVitest } from '@shop/config/vitest';

const here = import.meta.dirname;

export default shopVitest({
  dirname: here,
  // See the note in tsconfig.json: the harness is aliased rather than depended
  // on, to keep `@shop/core` and `@shop/testing` out of a workspace cycle.
  alias: {
    '@shop/testing': path.resolve(here, '../testing/src/index.ts'),
  },
  intGlobalSetup: path.resolve(here, '../testing/src/harness/global-setup.ts'),
});
