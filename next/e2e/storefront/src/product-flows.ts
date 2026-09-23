import type { APIRequestContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { payOrder } from './fixtures';
import type { Stack } from './stack';

/**
 * The one shopper motion every paid journey (2, 3, 4, 6) starts with: put a
 * single-SKU product in the cart or buy it now, from its detail page.
 *
 * `pages/goods_details/index.vue`'s `goCat()` always needs two taps of the
 * same button, spec picker or not: the first tap only opens the attribute
 * popup (`isOpen` starts `false` on every page load) and returns without
 * calling `postCartAdd`; the second tap is what actually adds it, because by
 * then `isOpen` is `true`. This is true even for a zero-spec product — there
 * is no popup to *see* for one, but the same two-tap state machine still
 * gates the call.
 */
export async function addSingleSkuProduct(
  page: Page,
  options: { productId: number; mode: 'cart' | 'buy-now' },
): Promise<void> {
  await page.goto(`/pages/goods_details/index?id=${options.productId}`);
  const label = options.mode === 'cart' ? '加入购物车' : '立即购买';
  const button = page.getByText(label, { exact: true });
  await expect(button).toBeVisible();
  await button.click();
  // The popup's open animation; the second tap has to land after `isOpen`
  // actually flips, not just after the DOM node exists.
  await page.waitForTimeout(400);
  await button.click();
}

/**
 * `order_addcart/order_addcart.vue`'s cart tab → `立即下单`, which navigates
 * to `order_confirm` with every *ticked* row's id. `全选` first, so a spec
 * that only just added one item does not depend on what the cart already
 * had ticked from a prior page load.
 */
export async function checkoutFromCart(page: Page): Promise<void> {
  await page.goto('/pages/order_addcart/order_addcart');
  const selectAll = page.getByText('全选', { exact: false }).first();
  await expect(selectAll).toBeVisible();
  await selectAll.click();
  await page.getByTestId('cart-checkout').click();
  await page.waitForURL(/order_confirm/);
}

/**
 * `order_confirm/index.vue`'s `提交订单`, which calls `orderCreate` and then
 * `uni.reLaunch`s straight to the cashier — there is no inline success state
 * to wait for, only the URL changing.
 */
export async function submitOrder(page: Page): Promise<void> {
  await page.getByTestId('confirm-submit').click();
  await page.waitForURL(/cashier\/index/, { timeout: 30_000 });
}

/**
 * `cashier/index.vue`'s `确认支付`, settled through the fake gateway's
 * control-plane bridge rather than followed through the UI's own redirect.
 *
 * The cashier's non-WeChat-browser path (`WECHAT_H5_PAY`) `uni.reLaunch`es
 * to `order_pay_status` and *then*, 1.5s later, does `location.href = h5_url`
 * — the fake gateway's own `/h5-cashier` (`@shop/testing`), which
 * sends the browser straight back and settles nothing, as WeChat's cashier
 * does when the shopper gives up. So the payment is settled here: capturing
 * `outTradeNo` from the `POST /orders/:id/payments` response (which only
 * succeeds when the real H5 create got its `h5_url`) and driving `payOrder`
 * is the same event a real WeChat notification would produce (`markPaid` +
 * `postNotify` against the real webhook route).
 */
export async function payAtCashier(page: Page, shop: Stack): Promise<string> {
  const paymentResponse = page.waitForResponse(
    (response) =>
      /\/api\/v1\/orders\/[^/]+\/payments$/.test(new URL(response.url()).pathname) &&
      response.request().method() === 'POST',
  );
  await page.getByTestId('pay-submit').click();
  const response = await paymentResponse;
  expect(response.ok(), `payment create failed: ${response.status()}`).toBe(true);
  const body = (await response.json()) as { outTradeNo: string };
  await payOrder(shop, body.outTradeNo);
  return body.outTradeNo;
}

/** Polls the real order-detail route until the payment has landed. */
export async function waitForOrderPaid(api: APIRequestContext, orderId: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const response = await api.get(`/api/v1/orders/${orderId}`);
    const body = (await response.json()) as { status: string };
    if (body.status !== 'pending_payment') return;
    if (Date.now() > deadline) throw new Error(`order ${orderId} never left pending_payment`);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

/**
 * Arranges a paid order the way journeys 3, 4 and 6 need one to already
 * exist, through the real HTTP checkout API rather than the product-page UI
 * — the UI path for "buy this" is what journey 2 alone is responsible for
 * proving.
 */
export async function arrangePaidOrder(
  api: APIRequestContext,
  shop: Stack,
  options: {
    skuId: number;
    quantity?: number;
    addressId: number;
    kind?: 'normal' | 'groupbuy' | 'presale';
    kindMeta?: Record<string, unknown>;
  },
): Promise<{ id: string; orderNo: string }> {
  const created = await api.post('/api/v1/orders', {
    data: {
      source: 'buy-now',
      item: { skuId: String(options.skuId), quantity: options.quantity ?? 1 },
      addressId: String(options.addressId),
      kind: options.kind ?? 'normal',
      kindMeta: options.kindMeta,
      idempotencyKey: `e2e-${options.skuId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
  });
  expect(created.ok(), `order create failed: ${created.status()} ${await created.text()}`).toBe(
    true,
  );
  const order = (await created.json()) as { id: string; orderNo: string };

  const paymentStart = await api.post(`/api/v1/orders/${order.id}/payments`, {
    data: { channel: 'wechat_h5', returnUrl: shop.baseUrl },
  });
  expect(
    paymentStart.ok(),
    `payment start failed: ${paymentStart.status()} ${await paymentStart.text()}`,
  ).toBe(true);
  const intent = (await paymentStart.json()) as { outTradeNo: string };
  await payOrder(shop, intent.outTradeNo);
  await waitForOrderPaid(api, order.id);

  return order;
}

/**
 * Removes every row from the shopper's cart, through the real cart API.
 *
 * The shoppers are shared by every journey on a warm stack, so a cart
 * journey that does not start from an empty cart would be asserting on
 * whatever the previous run left behind.
 */
export async function emptyCart(api: APIRequestContext): Promise<void> {
  const list = await api.get('/api/v1/cart?page=1&pageSize=100&filter=all');
  expect(list.ok(), `cart list failed: ${list.status()}`).toBe(true);
  const { items } = (await list.json()) as { items: Array<{ id: string }> };
  if (items.length === 0) return;
  const removed = await api.post('/api/v1/cart/items/removals', {
    data: { itemIds: items.map((item) => item.id), unavailableOnly: false },
  });
  expect(removed.ok(), `cart removal failed: ${removed.status()} ${await removed.text()}`).toBe(
    true,
  );
}

/** Puts one SKU in the cart through the real cart API; the product page's own 加入购物车 has its own test. */
export async function arrangeCartItem(
  api: APIRequestContext,
  skuId: number,
  quantity = 1,
): Promise<string> {
  const added = await api.post('/api/v1/cart/items', {
    data: { skuId: String(skuId), quantity },
  });
  expect(added.ok(), `cart add failed: ${added.status()} ${await added.text()}`).toBe(true);
  return ((await added.json()) as { item: { id: string } }).item.id;
}

/**
 * No component on the page prints an object as text.
 *
 * Vue renders `{{ obj }}` as `JSON.stringify(obj, null, 2)`, so a component
 * bound to an object where it expects a string shows up as `{ "key": …`
 * among the product copy. Read off `innerText`, which is what a shopper
 * sees, once the page's own content is on screen.
 */
export async function expectNoRawJson(page: Page): Promise<void> {
  const text = await page.evaluate(() => document.body.innerText);
  expect(
    text.match(/\{\s*"[^"\n]+"\s*:[^\n]*/g) ?? [],
    'a component printed an object as raw JSON',
  ).toEqual([]);
}
