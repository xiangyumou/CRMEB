import { blockedBy } from '../src/blocked';
import { test, expect } from '../src/fixtures';
import { arrangePaidOrder } from '../src/product-flows';
import { uniTextarea } from '../src/uni';

/**
 * Journey 4 — Refund.
 *
 * `goods_return/index.vue`'s reason picker defaults to index `0` and is
 * never validated — only the remark textarea is (`请输入备注`) — so this
 * journey never has to drive the uni-app `<picker>` popup, which is a mobile
 * wheel overlay that does not map onto a Playwright locator the way a plain
 * `<select>` would.
 *
 * A `refund_only` request goes straight to the gateway on admin approval
 * (`refund.admin.ts`), which `scripts/serve.ts` set to settle synchronously
 * (`gateway.behaviour.refundStatus = 'SUCCESS'`) — no second webhook
 * simulation needed, unlike payment.
 *
 * The shopper reaches the refund form from the order-detail page's 申请退款,
 * which does not render today (CR-4-i §7). So the refund itself is proven
 * from the form on — opened by the exact link that button builds — and the
 * way in through the order-detail page is its own `blockedBy` test.
 */

test('a shopper applies for a refund, it is approved, and the money moves', async ({
  shopperPage,
  shopperApi,
  adminApi,
  shop,
}) => {
  const order = await arrangePaidOrder(shopperApi, shop, {
    skuId: shop.fixtures.postageSkuId,
    addressId: shop.fixtures.primaryAddressId,
  });

  // `order_details`' 申请退款 for a one-line order: `goods_return?orderId=&id=`.
  await shopperPage.goto(`/pages/goods/goods_return/index?orderId=${order.orderNo}&id=${order.id}`);
  await expect(shopperPage.getByText('E2E 运费商品').first()).toBeVisible({ timeout: 15_000 });
  await uniTextarea(shopperPage).first().fill('E2E 退款：不想要了');

  const refundResponse = shopperPage.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/refunds' &&
      response.request().method() === 'POST',
  );
  await shopperPage.getByText('申请退款', { exact: true }).click();
  const refundBody = (await (await refundResponse).json()) as {
    id: string;
    kind: string;
    amount: string;
  };
  expect(refundBody.kind).toBe('refund_only');
  expect(refundBody.amount).toBe('39.00');

  // The form hands the shopper to their after-sales list, where it is pending.
  await shopperPage.waitForURL(/user_return_list/, { timeout: 15_000 });
  const pendingRow = shopperPage.locator('.goodWrapper', { hasText: 'E2E 运费商品' }).first();
  await expect(pendingRow).toBeVisible({ timeout: 15_000 });

  const approve = await adminApi.post(`/admin-api/refunds/${refundBody.id}/approve`, {
    data: { remark: 'E2E: 同意退款' },
  });
  expect(approve.ok(), `approve failed: ${approve.status()} ${await approve.text()}`).toBe(true);

  await expect(async () => {
    const detail = (await (await shopperApi.get(`/api/v1/refunds/${refundBody.id}`)).json()) as {
      status: string;
      refundedAmount: string;
    };
    expect(detail.status).toBe('succeeded');
    expect(detail.refundedAmount).toBe('39.00');
  }).toPass({ timeout: 20_000 });

  // And the storefront's own after-sales list shows it with the amount that
  // moved. (Which *tab* it is filed under is the blocked test below.)
  await shopperPage.goto('/pages/users/user_return_list/index');
  const refundedRow = shopperPage.locator('.goodWrapper', { hasText: 'E2E 运费商品' }).first();
  await expect(refundedRow).toBeVisible({ timeout: 15_000 });
  await expect(refundedRow).toContainText('39.00');
});

test('a refunded request is filed under 已退款 with the 已退款 stamp', async ({
  shopperPage,
  shopperApi,
  adminApi,
  shop,
}) => {
  blockedBy(
    'CR-4-i §12: the list tabs send refund_status, the wrapper reads another key — every tab asks state=all; §13: refund_type is numbered 0–5, the page stamps 1–6',
  );
  const order = await arrangePaidOrder(shopperApi, shop, {
    skuId: shop.fixtures.postageSkuId,
    addressId: shop.fixtures.primaryAddressId,
  });
  const lines = (await (
    await shopperApi.get(`/api/v1/refunds/applicable-items/${order.id}`)
  ).json()) as { items: Array<{ orderItemId: string }> };
  const applied = await shopperApi.post('/api/v1/refunds', {
    data: {
      orderId: order.id,
      kind: 'refund_only',
      lines: [{ orderItemId: lines.items[0]!.orderItemId, quantity: 1 }],
      reason: '不想要了',
      explanation: '',
      images: [],
      includeFreight: false,
    },
  });
  expect(applied.ok(), `refund apply failed: ${applied.status()} ${await applied.text()}`).toBe(
    true,
  );
  const refund = (await applied.json()) as { id: string };
  const approve = await adminApi.post(`/admin-api/refunds/${refund.id}/approve`, {
    data: { remark: 'E2E: 同意退款' },
  });
  expect(approve.ok()).toBe(true);
  await expect(async () => {
    const detail = (await (await shopperApi.get(`/api/v1/refunds/${refund.id}`)).json()) as {
      status: string;
    };
    expect(detail.status).toBe('succeeded');
  }).toPass({ timeout: 20_000 });

  await shopperPage.goto('/pages/users/user_return_list/index');
  const refundedList = shopperPage.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/refunds' &&
      new URL(response.url()).searchParams.get('state') === 'succeeded',
  );
  await shopperPage.locator('.top-tabs .tabs', { hasText: '已退款' }).click();
  const listed = (await (await refundedList).json()) as { items: Array<{ id: string }> };
  expect(listed.items.map((item) => item.id)).toContain(refund.id);
  await expect(
    shopperPage.locator('.goodWrapper', { has: shopperPage.locator('.icon-yituikuan') }).first(),
  ).toBeVisible({ timeout: 15_000 });
});

test('a shopper opens the refund form from the order page', async ({
  shopperPage,
  shopperApi,
  shop,
}) => {
  blockedBy('CR-4-i §7: the order-detail page throws on help_info (null) and renders nothing');
  const order = await arrangePaidOrder(shopperApi, shop, {
    skuId: shop.fixtures.postageSkuId,
    addressId: shop.fixtures.primaryAddressId,
  });
  await shopperPage.goto(`/pages/goods/order_details/index?order_id=${order.id}`);
  await shopperPage.getByText('申请退款', { exact: true }).first().click();
  await shopperPage.waitForURL(/goods_return/, { timeout: 15_000 });
  await expect(shopperPage.getByText('E2E 运费商品').first()).toBeVisible();
});
