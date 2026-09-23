import { blockedBy } from '../src/blocked';
import { test } from '../src/fixtures';

/**
 * Journey 7 — Presale: the order shows the presale price, not the catalogue
 * price.
 *
 * Blocked by CR-2-i (`docs/rewrite/cr/CR-2-i.md`, raised against D2):
 * `pages/activity/presell_details/index.vue` has the purchase flow — its own
 * `goBuy()`, its own spec picker — but is not registered in `pages.json`,
 * and `presell/index.vue` (the list, which *is* registered) sends the
 * shopper to the plain `goods_details` page instead, which has no presale
 * checkout wiring at all. There is no tap sequence from a shopper's phone
 * that reaches a presale purchase.
 *
 * `presaleActivityId`/`activitySkuId` (`shop.fixtures`) exist and are ready
 * the moment `presell_details` is reachable. CR-2-i is decided and assigned
 * to W5T; the journey body is written when that lands, because until then
 * there is no screen to write it against.
 */

test('presale price is what the order shows, not the catalogue price', () => {
  blockedBy(
    'CR-2-i: presell_details is not registered in pages.json; the list opens goods_details',
  );
  // Nothing past this line runs until CR-2-i lands: there is no screen yet.
  throw new Error('journey 7 is not written yet — write it against presell_details (CR-2-i)');
});
