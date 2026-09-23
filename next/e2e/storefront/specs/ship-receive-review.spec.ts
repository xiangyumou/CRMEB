import { shipOrder } from '@shop/core/order';

import { blockedBy } from '../src/blocked';
import { test, expect } from '../src/fixtures';
import { arrangePaidOrder } from '../src/product-flows';
import type { Stack } from '../src/stack';
import { uniTextarea } from '../src/uni';

/**
 * Journey 3 — Ship → receive → review.
 *
 * The order is arranged paid through the real checkout API (`arrangePaidOrder`
 * — journey 2 alone is responsible for the path to the cashier), and shipped
 * through the domain service directly (`shipOrder(shop.ctx, …)`), the same
 * way `@shop/e2e-admin`'s own `order.spec.ts` arranges a shippable order when
 * it is not the shipping *screen* under test. What this journey exercises is
 * the storefront: does a shopper's own screen show the shipment, can they
 * confirm receipt, and can they then write a review.
 *
 * Today the order-detail page does not render at all (CR-4-i §7), and it is
 * where 确认收货 and 评价 live, so the journey is split: the logistics page
 * and the review page are reached by the links the order-detail page would
 * have followed — receipt confirmed through the real receipt route in
 * between — and the whole motion through the order-detail page is kept as a
 * `blockedBy` test. The review is written against the multi-spec product's
 * line: a zero-spec line crashes the review page (CR-4-i §8), which the
 * blocked test covers.
 */

const TRACKING_NO = 'SF9988776655';

async function arrangeShippedOrder(
  api: Parameters<typeof arrangePaidOrder>[0],
  shop: Stack,
  skuId: number,
): Promise<{ id: string; orderNo: string }> {
  const order = await arrangePaidOrder(api, shop, {
    skuId,
    addressId: shop.fixtures.primaryAddressId,
  });
  await shipOrder(shop.ctx, {
    orderId: Number(order.id),
    body: {
      deliveryMode: 'express',
      lines: [],
      expressCompanyId: String(shop.fixtures.expressCompanyId),
      trackingNo: TRACKING_NO,
    },
    operatorAdminId: shop.admin.id,
  });
  return order;
}

test('a shopper sees a shipped order with its courier and tracking number', async ({
  shopperPage,
  shopperApi,
  shop,
}) => {
  const order = await arrangeShippedOrder(shopperApi, shop, shop.fixtures.postageSkuId);

  // The order-detail page's 查看物流 link.
  await shopperPage.goto(`/pages/goods/goods_logistics/index?orderId=${order.orderNo}`);
  await expect(shopperPage.getByText('E2E 运费商品').first()).toBeVisible({ timeout: 15_000 });
  await expect(shopperPage.getByText('顺丰速运').first()).toBeVisible();
  await expect(shopperPage.getByText(TRACKING_NO).first()).toBeVisible();
});

test('a shopper reviews a received order line', async ({ shopperPage, shopperApi, shop }) => {
  const skuId = shop.fixtures.multiSpecSkuIds[0]!;
  const order = await arrangeShippedOrder(shopperApi, shop, skuId);
  const receipt = await shopperApi.post(`/api/v1/orders/${order.id}/receipt`, { data: {} });
  expect(receipt.ok(), `receipt failed: ${receipt.status()} ${await receipt.text()}`).toBe(true);
  const detail = (await (await shopperApi.get(`/api/v1/orders/${order.id}`)).json()) as {
    status: string;
    items: Array<{ id: string }>;
  };
  expect(['received', 'completed']).toContain(detail.status);

  // The order-detail page's 评价 link: the line's key and the order number.
  await shopperPage.goto(
    `/pages/goods/goods_comment_con/index?unique=${detail.items[0]!.id}&uni=${order.orderNo}`,
  );
  await expect(shopperPage.getByText('E2E 多规格商品').first()).toBeVisible({ timeout: 15_000 });
  await uniTextarea(shopperPage).first().fill('E2E 评价：颜色很正，尺码合适。');
  await shopperPage.getByText('立即评价', { exact: true }).click();
  await expect(shopperPage.getByText('感谢您的评价', { exact: false })).toBeVisible({
    timeout: 15_000,
  });

  // And it is really attached to the product, not just thanked for once.
  await expect(async () => {
    const reviews = (await (
      await shopperApi.get(`/api/v1/catalog/products/${shop.fixtures.multiSpecProductId}/reviews`)
    ).json()) as { items: Array<{ content: string }> };
    expect(reviews.items.some((review) => review.content.includes('颜色很正'))).toBe(true);
  }).toPass({ timeout: 10_000 });
});

test('a shopper confirms receipt from the order page and reviews it from there', async ({
  shopperPage,
  shopperApi,
  shop,
}) => {
  blockedBy(
    'CR-4-i §7: the order-detail page throws on help_info (null) and renders nothing; §8: a zero-spec line crashes the review page',
  );
  const order = await arrangeShippedOrder(shopperApi, shop, shop.fixtures.postageSkuId);

  await shopperPage.goto(`/pages/goods/order_details/index?order_id=${order.id}`);
  await shopperPage.getByText('查看物流', { exact: true }).click({ timeout: 15_000 });
  await shopperPage.waitForURL(/goods_logistics/);
  await expect(shopperPage.getByText(TRACKING_NO).first()).toBeVisible();
  await shopperPage.goBack();

  const confirmReceipt = shopperPage.getByText('确认收货', { exact: true });
  await expect(confirmReceipt).toBeVisible();
  await confirmReceipt.click();
  await expect(shopperPage.getByText('为保障权益', { exact: false })).toBeVisible();
  await shopperPage.getByText('确定', { exact: true }).click();

  // The order really moved, not just the screen.
  await expect(async () => {
    const detail = (await (await shopperApi.get(`/api/v1/orders/${order.id}`)).json()) as {
      status: string;
    };
    expect(['received', 'completed']).toContain(detail.status);
  }).toPass({ timeout: 15_000 });

  const reviewButton = shopperPage.getByText('评价', { exact: true }).first();
  await expect(reviewButton).toBeVisible({ timeout: 15_000 });
  await reviewButton.click();
  await shopperPage.waitForURL(/goods_comment_con/);

  await uniTextarea(shopperPage).first().fill('E2E 评价：料子很舒服，物流也很快。');
  await shopperPage.getByText('立即评价', { exact: true }).click();
  await expect(shopperPage.getByText('感谢您的评价', { exact: false })).toBeVisible({
    timeout: 15_000,
  });

  await expect(async () => {
    const reviews = (await (
      await shopperApi.get(`/api/v1/catalog/products/${shop.fixtures.postageProductId}/reviews`)
    ).json()) as { items: Array<{ content: string }> };
    expect(reviews.items.some((review) => review.content.includes('料子很舒服'))).toBe(true);
  }).toPass({ timeout: 10_000 });
});
