import { groupbuyGroups } from '@shop/db/schema/groupbuy';
import { desc, eq } from 'drizzle-orm';

import { blockedBy } from '../src/blocked';
import { test, expect } from '../src/fixtures';
import { payAtCashier, submitOrder } from '../src/product-flows';

/**
 * Journey 6 — Group buy.
 *
 * `seatsRequired: 2` (`src/seed.ts`), so one partner is exactly enough to
 * complete it. Both `goods_combination_details.vue`'s "立即开团" and
 * `goods_combination_status.vue`'s "我要参团" open the same
 * `productWindow` spec popup `goods_details` does, and both need the same
 * two taps — the first only opens it (`isOpen` starts `false`), the second
 * is the real submit. `goods_combination_status.vue` additionally renders
 * `productWindow` with `:iSbnt="1"`, so its *second* tap lands on a second,
 * popup-internal element with the same "我要参团" text — `.last()` picks
 * that one rather than the (now-covered) outer trigger.
 *
 * There is no screen that hands a shopper the just-opened team's id — it
 * only ever appears embedded in a share link — so this journey reads it
 * back from `groupbuy_groups` directly, the same "arrange/read what the UI
 * cannot show" use of `shop.db` `src/stack.ts` documents itself for.
 *
 * Blocked today at the first tap: the activity page never shows 立即开团
 * for the seeded activity (CR-4-i §8 — the SKU view model has no
 * `product_stock`, and a zero-spec product's SKU is never selected), and
 * past it, 提交订单 is refused for every order (CR-4-i §10).
 */

test('two shoppers complete a group-buy team', async ({
  shopperPage,
  secondaryShopperPage,
  shop,
}) => {
  blockedBy(
    'CR-4-i §8: 立即开团 never renders (no product_stock; zero-spec SKU never selected); §10: 提交订单 is a 422',
  );
  // --- primary opens a new team -------------------------------------------------
  await shopperPage.goto(
    `/pages/activity/goods_combination_details/index?id=${shop.fixtures.groupBuyActivityId}`,
  );
  await expect(shopperPage.getByText('E2E 拼团活动').first()).toBeVisible();

  const openTeam = shopperPage.getByText('立即开团', { exact: true });
  await expect(openTeam).toBeVisible();
  await openTeam.click();
  await shopperPage.waitForTimeout(400);
  await openTeam.click();

  await submitOrder(shopperPage);
  await payAtCashier(shopperPage, shop);

  const [group] = await shop.db
    .select({ id: groupbuyGroups.id })
    .from(groupbuyGroups)
    .where(eq(groupbuyGroups.activityId, shop.fixtures.groupBuyActivityId))
    .orderBy(desc(groupbuyGroups.createdAt))
    .limit(1);
  expect(group, "no groupbuy_groups row was created for the primary shopper's order").toBeTruthy();
  const groupId = group!.id;

  // --- secondary joins it ---------------------------------------------------------
  await secondaryShopperPage.goto(`/pages/activity/goods_combination_status/index?id=${groupId}`);
  await expect(secondaryShopperPage.getByText('拼团中', { exact: false }).first()).toBeVisible({
    timeout: 15_000,
  });

  const joinTeam = secondaryShopperPage.getByText('我要参团', { exact: true });
  await expect(joinTeam.first()).toBeVisible();
  await joinTeam.first().click();
  await secondaryShopperPage.waitForTimeout(400);
  await joinTeam.last().click();

  await submitOrder(secondaryShopperPage);
  await payAtCashier(secondaryShopperPage, shop);

  // The team is full, from the domain's own point of view, not just a screen.
  await expect(async () => {
    const [row] = await shop.db
      .select({ status: groupbuyGroups.status, seatsTaken: groupbuyGroups.seatsTaken })
      .from(groupbuyGroups)
      .where(eq(groupbuyGroups.id, groupId));
    expect(row?.status).toBe('succeeded');
    expect(row?.seatsTaken).toBe(2);
  }).toPass({ timeout: 15_000 });

  // And the storefront's own status page agrees.
  await secondaryShopperPage.goto(`/pages/activity/goods_combination_status/index?id=${groupId}`);
  await expect(secondaryShopperPage.getByText('恭喜您拼团成功', { exact: false })).toBeVisible({
    timeout: 15_000,
  });
});
