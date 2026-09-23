import { blockedBy } from '../src/blocked';
import { test, expect } from '../src/fixtures';
import {
  addSingleSkuProduct,
  arrangeCartItem,
  checkoutFromCart,
  emptyCart,
  payAtCashier,
  submitOrder,
} from '../src/product-flows';

/**
 * Journey 2 — Cart → checkout → pay.
 *
 * Runs the fixed-postage product (`postageProductId`), which is single-SKU,
 * so this journey stays about the cart/checkout/pay mechanics rather than the
 * spec picker. Its freight template (`src/seed.ts`) charges ¥6 for the first
 * unit and ¥2 for each one after, to the seeded 深圳 address — so one unit
 * pays ¥45.00 and two pay ¥86.00, and a checkout that forgot freight, or
 * priced it per line instead of per unit, shows a different number.
 *
 * The journey is cut where the storefront is broken today, and each cut is
 * a `blockedBy` test that keeps the whole motion it should prove:
 *
 * - the product page's 加入购物车 (CR-2-h3) — the cart is arranged through
 *   the real cart API instead, and everything from the cart page on is the
 *   shopper's own taps;
 * - the confirm page's 提交订单 (CR-4-i §10) — the order the cashier test
 *   pays is created through the real order API instead;
 * - the freight line and the coupon picker on the confirm page (CR-4-i §9,
 *   §11).
 *
 * Payment is settled through the fake gateway's control-plane bridge
 * (`payAtCashier`), not by following the cashier's redirect — see that
 * function's own comment for why.
 */

test('a shopper changes the quantity in the cart and checks out to a freight-inclusive total', async ({
  shopperPage,
  shopperApi,
  shop,
}) => {
  await emptyCart(shopperApi);
  const cartItemId = await arrangeCartItem(shopperApi, shop.fixtures.postageSkuId);

  await shopperPage.goto('/pages/order_addcart/order_addcart');
  const row = shopperPage.locator('.item', { hasText: 'E2E 运费商品' }).first();
  await expect(row).toBeVisible();
  await row.locator('.carnum .plus').click();

  // The + really changed the server's cart, not only the number on screen.
  await expect(async () => {
    const cart = (await (await shopperApi.get('/api/v1/cart?page=1&pageSize=20')).json()) as {
      items: Array<{ id: string; quantity: number }>;
    };
    expect(cart.items.find((item) => item.id === cartItemId)?.quantity).toBe(2);
  }).toPass({ timeout: 10_000 });
  await expect(shopperPage.locator('.footer', { hasText: '立即下单' })).toContainText('78');

  await checkoutFromCart(shopperPage);

  // The seeded default address, both units, and a total that includes the
  // template's freight: 2 × ¥39 + ¥6 + ¥2.
  await expect(shopperPage.getByText('小明', { exact: false }).first()).toBeVisible();
  await expect(
    shopperPage.getByText('南山区科技园路 1 号', { exact: false }).first(),
  ).toBeVisible();
  await expect(shopperPage.getByText('共2件商品', { exact: false })).toBeVisible();
  await expect(shopperPage.locator('.footer', { hasText: '合计' })).toContainText('86.00');
});

test('a shopper pays an order at the cashier and the order is paid', async ({
  shopperPage,
  shopperApi,
  shop,
}) => {
  const created = await shopperApi.post('/api/v1/orders', {
    data: {
      source: 'buy-now',
      item: { skuId: String(shop.fixtures.postageSkuId), quantity: 1 },
      addressId: String(shop.fixtures.primaryAddressId),
      kind: 'normal',
      idempotencyKey: `e2e-cashier-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
  });
  expect(created.ok(), `order create failed: ${created.status()} ${await created.text()}`).toBe(
    true,
  );
  const order = (await created.json()) as { id: string; payableAmount: string };
  expect(order.payableAmount).toBe('45.00');

  await shopperPage.goto(`/pages/goods/cashier/index?order_id=${order.id}&from_type=order`);
  await expect(shopperPage.getByText('微信支付', { exact: true }).first()).toBeVisible();
  await payAtCashier(shopperPage, shop);

  // The order really moved, not just whatever a page shows …
  await expect(async () => {
    const detail = (await (await shopperApi.get(`/api/v1/orders/${order.id}`)).json()) as {
      status: string;
      paidAmount: string | null;
    };
    expect(detail.status).toBe('paid');
    expect(detail.paidAmount).toBe('45.00');
  }).toPass({ timeout: 15_000 });

  // … and the result page WeChat returns the shopper to says so. The
  // cashier opens that page *before* sending the shopper to WeChat (and the
  // fake cashier sends them straight back), so its first render can precede
  // the payment notification; a shopper back from WeChat lands on a fresh
  // load of it, which is what the reload is.
  await shopperPage.waitForURL(/order_pay_status/, { timeout: 15_000 });
  await shopperPage.reload();
  await expect(shopperPage.getByText('订单支付成功')).toBeVisible({ timeout: 15_000 });
  await expect(shopperPage.getByText('45.00', { exact: false }).first()).toBeVisible();
});

test('the confirm page itemises the freight it charges', async ({
  shopperPage,
  shopperApi,
  shop,
}) => {
  blockedBy('CR-4-i §9: 配送运费 renders ¥NaN — priceGroup has no storePostageDiscount');
  await emptyCart(shopperApi);
  await arrangeCartItem(shopperApi, shop.fixtures.postageSkuId);
  await checkoutFromCart(shopperPage);
  const freight = shopperPage.locator('.item', { hasText: '配送运费' }).first();
  await expect(freight).toContainText('6.00');
  await expect(shopperPage.locator('.footer', { hasText: '合计' })).toContainText('45.00');
});

test('a shopper applies a granted coupon on the confirm page', async ({
  shopperPage,
  shopperApi,
  shop,
}) => {
  blockedBy(
    "CR-4-i §11: the applicable-coupons request sends productId '0' and is refused (422), so the picker is empty",
  );
  await emptyCart(shopperApi);
  await arrangeCartItem(shopperApi, shop.fixtures.postageSkuId);
  await checkoutFromCart(shopperPage);

  // The confirm page applies the first usable coupon by itself
  // (`getCouponList` → `ChangCoupons(0)`) — ¥39 + ¥6 freight − ¥5.
  const couponRow = shopperPage.locator('.wrapper .item', { hasText: '优惠券' }).first();
  await expect(couponRow).toContainText('E2E 满减券');
  await expect(shopperPage.locator('.item', { hasText: '优惠券抵扣' }).first()).toContainText(
    '5.00',
  );
  await expect(shopperPage.locator('.footer', { hasText: '合计' })).toContainText('40.00');

  // And the picker lists it, marked as the one in use.
  await couponRow.click();
  await expect(
    shopperPage.locator('.coupon-list-window .coupon-list .item', { hasText: 'E2E 满减券' }),
  ).toBeVisible();
});

test('a shopper submits the confirm page, pays at the cashier, and sees the order awaiting shipment', async ({
  shopperPage,
  shopperApi,
  shop,
}) => {
  blockedBy(
    'CR-4-i §10: 提交订单 posts no cartItemIds, an empty idempotencyKey and customForm as an array — every order create is a 422',
  );
  await emptyCart(shopperApi);
  await arrangeCartItem(shopperApi, shop.fixtures.postageSkuId);
  await checkoutFromCart(shopperPage);

  await submitOrder(shopperPage);
  const url = shopperPage.url();
  const orderId = new URL(url).searchParams.get('order_id');
  expect(orderId, `cashier URL had no order_id: ${url}`).toBeTruthy();

  await payAtCashier(shopperPage, shop);

  await expect(async () => {
    const detail = (await (await shopperApi.get(`/api/v1/orders/${orderId}`)).json()) as {
      status: string;
      paidAmount: string | null;
    };
    expect(detail.status).toBe('paid');
    expect(detail.paidAmount).toBe('45.00');
  }).toPass({ timeout: 15_000 });

  // The storefront's own order-detail screen shows it, not just the API.
  await shopperPage.goto(`/pages/goods/order_details/index?order_id=${orderId}`);
  await expect(shopperPage.getByText('待发货', { exact: false }).first()).toBeVisible({
    timeout: 15_000,
  });
});

test('a shopper adds a product to the cart from its page and the cart agrees', async ({
  shopperPage,
  shopperApi,
  shop,
}) => {
  blockedBy('CR-2-h3: the product page is a DIY product_detail page no storefront route serves');
  await emptyCart(shopperApi);
  await addSingleSkuProduct(shopperPage, {
    productId: shop.fixtures.postageProductId,
    mode: 'cart',
  });
  await expect(shopperPage.getByText('添加成功')).toBeVisible();
  await addSingleSkuProduct(shopperPage, {
    productId: shop.fixtures.postageProductId,
    mode: 'cart',
  });

  // Two adds of the same SKU are one row of two units: `items` counts rows
  // (the tab-bar badge), `quantity` counts units.
  const count = (await (await shopperApi.get('/api/v1/cart/count')).json()) as {
    items: number;
    quantity: number;
  };
  expect(count).toMatchObject({ items: 1, quantity: 2 });

  await shopperPage.goto('/pages/order_addcart/order_addcart');
  await expect(shopperPage.getByText('E2E 运费商品').first()).toBeVisible();
});
