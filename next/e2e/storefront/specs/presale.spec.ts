import { userCoupons } from '@shop/db/schema/coupon';
import { adminCreate, adminDelete, adminGrant } from '@shop/core/coupon';
import { eq } from 'drizzle-orm';
import { test, expect } from '../src/fixtures';
import { payAtCashier, submitOrder } from '../src/product-flows';

/**
 * Journey 7 — Presale: the order shows the presale price, not the catalogue
 * price.
 *
 * The seeded activity product (`src/seed.ts`, "E2E 活动商品") sells at ¥88.00;
 * its presale activity (`shop.fixtures.presaleActivityId`, full payment,
 * free freight) sells the same SKU at ¥78.00. The shopper goes the way a
 * phone does — the 预售 list, the activity's own `presell_details` page
 * (registered by W5T, CR-2-i), 立即购买, the confirm page, 提交订单, the
 * cashier — and every step that names a price names ¥78.00. The order itself
 * is read back from the real create response and the real order route, so
 * what is proven is the domain's price, not only the screen's.
 *
 * The domain keeps ¥88.00 as the line's unit price and books the presale as a
 * −¥10.00 adjustment; the uni-app mappers turn that back into the ¥78.00 the
 * pages print (`api/mappers/order.js`, 活动价). Each order line carries
 * its own `adjustments` (CR-2-h4), the activity and the coupon apart, so the
 * second journey stacks a coupon on the presale and the order pages still
 * print ¥78.00 for the goods and the coupon on its own row.
 */

const CATALOGUE_PRICE = '88.00';
const PRESALE_PRICE = '78.00';

test('presale price is what the order shows, not the catalogue price', async ({
  shopperPage,
  shopperApi,
  shop,
}) => {
  // --- the 预售 list opens the activity's own page --------------------------------
  // The list names each card by its activity title.
  await shopperPage.goto('/pages/activity/presell/index');
  const card = shopperPage.getByText('E2E 预售活动').first();
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.click();
  await shopperPage.waitForURL(
    new RegExp(`presell_details/index\\?id=${shop.fixtures.presaleActivityId}\\b`),
  );
  await expect(shopperPage.getByText('预售价', { exact: false }).first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(shopperPage.getByText(PRESALE_PRICE, { exact: false }).first()).toBeVisible();

  // --- 立即购买: the first tap opens the spec sheet, the second buys ---------------
  const buy = shopperPage.getByText('立即购买', { exact: true });
  await expect(buy.first()).toBeVisible();
  await buy.first().click();
  await shopperPage.waitForTimeout(400);
  await buy.last().click();
  await shopperPage.waitForURL(/order_confirm/, { timeout: 15_000 });

  // --- the confirm page prices the line at the presale price ----------------------
  const goods = shopperPage.locator('.orderGoods').first();
  await expect(goods).toContainText('E2E 活动商品', { timeout: 15_000 });
  await expect(goods).toContainText(PRESALE_PRICE);
  await expect(goods).not.toContainText(CATALOGUE_PRICE);
  await expect(shopperPage.getByTestId('confirm-total')).toContainText(PRESALE_PRICE);

  // --- 提交订单: the order the domain created is a presale at ¥78.00 ---------------
  const created = shopperPage.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/orders' &&
      response.request().method() === 'POST',
  );
  await submitOrder(shopperPage);
  const order = (await (await created).json()) as {
    id: string;
    kind: string;
    itemsAmount: string;
    couponDiscount: string;
    freightAmount: string;
    payableAmount: string;
    userCouponId: string | null;
    items: Array<{ unitPrice: string; quantity: number; totalAmount: string }>;
  };
  expect(order.kind).toBe('presale');
  expect(order.items).toHaveLength(1);
  // B1 prices an activity as a `presale:activity-price` adjustment (CR-1-d,
  // CR-3-b1): the line keeps the catalogue unit price and the ¥10 lands in its
  // discount, so the line *total* is the presale price.
  expect(order.items[0]).toMatchObject({
    unitPrice: CATALOGUE_PRICE,
    quantity: 1,
    totalAmount: PRESALE_PRICE,
  });
  expect(order.itemsAmount).toBe(CATALOGUE_PRICE);
  expect(order.freightAmount).toBe('0.00');
  // The confirm page does not pick a coupon on its own, so the whole discount
  // is the presale one and the shopper pays exactly ¥78.00.
  expect(order.userCouponId).toBeNull();
  expect(order.couponDiscount).toBe((Number(CATALOGUE_PRICE) - Number(PRESALE_PRICE)).toFixed(2));
  expect(order.payableAmount).toBe(PRESALE_PRICE);

  // --- paid, and the order page shows the presale price ---------------------------
  await payAtCashier(shopperPage, shop);
  await expect(async () => {
    const detail = (await (await shopperApi.get(`/api/v1/orders/${order.id}`)).json()) as {
      status: string;
      paidAmount: string | null;
    };
    expect(detail.status).not.toBe('pending_payment');
    expect(detail.paidAmount).toBe(order.payableAmount);
  }).toPass({ timeout: 15_000 });

  await shopperPage.goto(`/pages/goods/order_details/index?order_id=${order.id}`);
  await expect(shopperPage.getByText('E2E 活动商品').first()).toBeVisible({ timeout: 15_000 });
  await expect(shopperPage.getByText(PRESALE_PRICE, { exact: false }).first()).toBeVisible();
  await expect(shopperPage.getByText(CATALOGUE_PRICE, { exact: false })).toHaveCount(0);
});

/**
 * CR-2-h4. A presale with a ¥5 coupon stacked: `couponDiscount` is ¥15, and
 * before the order lines carried their adjustments the ¥10 activity and the
 * ¥5 coupon could not be told apart, so the order pages printed ¥88.00.
 *
 * The confirm page picks no coupon for an activity (the legacy app never
 * did), so the order is created through the real checkout API with the
 * coupon named; the pages are the real order pages. The coupon is scoped to
 * the activity product while it exists, and revoked with the order cancelled
 * afterwards, so no other journey's totals see it.
 */
test('a presale with a stacked coupon still shows the presale price on the order pages', async ({
  shopperPage,
  shopperApi,
  shop,
}) => {
  const template = await adminCreate(shop.ctx, {
    name: 'E2E 预售叠加券',
    scope: 'products',
    claimMode: 'manual',
    status: 'active',
    discountAmount: '5.00',
    minSpend: '0.00',
    validityMode: 'days_after_claim',
    validFrom: undefined,
    validTo: undefined,
    validDays: 30,
    claimFrom: undefined,
    claimTo: undefined,
    isUnlimitedSupply: false,
    totalCount: 10,
    perUserLimit: 1,
    giftMinOrderAmount: undefined,
    sortOrder: 0,
    productIds: [String(shop.fixtures.activityProductId)],
    categoryIds: [],
  });
  let orderId: string | undefined;
  try {
    await adminGrant(shop.ctx, { id: template.id }, { userIds: [String(shop.users.primary.id)] });
    const [held] = await shop.db
      .select({ id: userCoupons.id })
      .from(userCoupons)
      .where(eq(userCoupons.templateId, Number(template.id)));

    const created = await shopperApi.post('/api/v1/orders', {
      data: {
        source: 'buy-now',
        item: { skuId: String(shop.fixtures.activitySkuId), quantity: 1 },
        addressId: String(shop.fixtures.primaryAddressId),
        kind: 'presale',
        kindMeta: { activityId: String(shop.fixtures.presaleActivityId) },
        userCouponId: String(held!.id),
        idempotencyKey: `e2e-presale-coupon-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      },
    });
    expect(created.ok(), `order create failed: ${created.status()} ${await created.text()}`).toBe(
      true,
    );
    const order = (await created.json()) as {
      id: string;
      couponDiscount: string;
      payableAmount: string;
      items: Array<{
        unitPrice: string;
        discountAmount: string;
        adjustments: Array<{ source: string; amount: string }>;
      }>;
    };
    orderId = order.id;
    expect(order.couponDiscount).toBe('15.00');
    expect(order.payableAmount).toBe('73.00');
    expect(order.items[0]).toMatchObject({ unitPrice: CATALOGUE_PRICE, discountAmount: '15.00' });
    // The line says which part is the activity and which the coupon.
    expect(order.items[0]!.adjustments.map(({ source, amount }) => ({ source, amount }))).toEqual([
      { source: 'presale:activity-price', amount: '-10.00' },
      { source: 'coupon:discount', amount: '-5.00' },
    ]);

    // --- 订单详情: goods at ¥78.00, the coupon on its own row, ¥73.00 to pay ---------
    await shopperPage.goto(`/pages/goods/order_details/index?order_id=${order.id}`);
    await expect(shopperPage.getByText('E2E 活动商品').first()).toBeVisible({ timeout: 15_000 });
    await expect(shopperPage.getByText(PRESALE_PRICE, { exact: false }).first()).toBeVisible();
    await expect(
      shopperPage.locator('.wrapper .item').filter({ hasText: '优惠券抵扣' }),
    ).toContainText('5.00');
    await expect(shopperPage.getByText('73.00', { exact: false }).first()).toBeVisible();
    await expect(shopperPage.getByText(CATALOGUE_PRICE, { exact: false })).toHaveCount(0);

    // --- 订单列表 (待付款): the same order prints the same ¥78.00 ------------------
    await shopperPage.goto('/pages/goods/order_list/index?status=0');
    const card = shopperPage
      .locator('.list > .item')
      .filter({ hasText: 'E2E 活动商品' })
      .filter({ hasText: '73.00' })
      .first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toContainText(PRESALE_PRICE);
    await expect(card).not.toContainText(CATALOGUE_PRICE);
  } finally {
    if (orderId) await shopperApi.post(`/api/v1/orders/${orderId}/cancel`, { data: {} });
    await shop.db
      .update(userCoupons)
      .set({ status: 'revoked' })
      .where(eq(userCoupons.templateId, Number(template.id)));
    await adminDelete(shop.ctx, { id: template.id });
  }
});
