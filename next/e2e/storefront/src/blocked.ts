import { test } from '@playwright/test';

/**
 * Marks the current test as blocked on another stream's open CR.
 *
 * On the tree this suite is merged into, a blocked journey is `fixme` — it is
 * skipped and listed as such, with the CR id as its reason, so the suite is
 * green and the gap is still visible in every report. It is *not* deleted or
 * weakened: the assertions stay exactly what the journey should prove.
 *
 * `SHOP_E2E_RUN_BLOCKED=1` runs it anyway. That is how a fixing stream proves
 * its fix — point `SHOP_E2E_UNIAPP_DIR` at the fixed uni-app tree (or rebuild
 * web on the fixed branch), set this, and the journey either passes, and the
 * `blockedBy` line comes out, or tells the fixer what is still missing.
 */
export function blockedBy(reason: string): void {
  test.fixme(process.env.SHOP_E2E_RUN_BLOCKED !== '1', reason);
}
