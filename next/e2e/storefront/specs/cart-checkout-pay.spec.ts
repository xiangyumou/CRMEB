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
 * Most tests arrange the cart through the real cart API so they stay about
 * one motion each; the product page's own 加入购物车, the confirm page's
 * 提交订单, its freight line and its coupon picker each have a test of their
 * own (once CR-2-h3 and CR-4-i §9–§11, all closed).
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
  const row = shopperPage.locator(
    `[data-testid="cart-row"][data-sku-id="${shop.fixtures.postageSkuId}"]`,
  );
  await expect(row).toContainText('E2E 运费商品');
  await row.getByTestId('cart-qty-plus').click();

  // The + really changed the server's cart, not only the number on screen.
  await expect(async () => {
    const cart = (await (await shopperApi.get('/api/v1/cart?page=1&pageSize=20')).json()) as {
      items: Array<{ id: string; quantity: number }>;
    };
    expect(cart.items.find((item) => item.id === cartItemId)?.quantity).toBe(2);
  }).toPass({ timeout: 10_000 });
  await expect(row.getByTestId('cart-qty').locator('input')).toHaveValue('2');
  await expect(shopperPage.getByTestId('cart-total')).toContainText('78');

  await checkoutFromCart(shopperPage);

  // The seeded default address, both units, and a total that includes the
  // template's freight: 2 × ¥39 + ¥6 + ¥2.
  const address = shopperPage.getByTestId('confirm-address');
  await expect(address).toContainText('小明');
  await expect(address).toContainText('南山区科技园路 1 号');
  await expect(shopperPage.getByText('共2件商品', { exact: false })).toBeVisible();
  await expect(shopperPage.getByTestId('confirm-total')).toContainText('86.00');
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
  await expect(shopperPage.getByTestId('pay-method-weixin')).toContainText('微信支付');
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
  await expect(shopperPage.getByTestId('pay-status')).toContainText('订单支付成功', {
    timeout: 15_000,
  });
  await expect(shopperPage.getByTestId('pay-amount')).toContainText('45.00');
});

test('the confirm page itemises the freight it charges', async ({
  shopperPage,
  shopperApi,
  shop,
}) => {
  await emptyCart(shopperApi);
  await arrangeCartItem(shopperApi, shop.fixtures.postageSkuId);
  await checkoutFromCart(shopperPage);
  const freight = shopperPage.getByTestId('confirm-freight');
  await expect(freight).toContainText('配送运费');
  await expect(freight).toContainText('6.00');
  await expect(shopperPage.getByTestId('confirm-total')).toContainText('45.00');
});

test('a shopper applies a granted coupon on the confirm page', async ({
  shopperPage,
  shopperApi,
  shop,
}) => {
  await emptyCart(shopperApi);
  await arrangeCartItem(shopperApi, shop.fixtures.postageSkuId);
  await checkoutFromCart(shopperPage);

  // The confirm page applies the first usable coupon by itself
  // (`getCouponList` → `ChangCoupons(0)`) — ¥39 + ¥6 freight − ¥5.
  const couponRow = shopperPage.getByTestId('confirm-coupon');
  await expect(couponRow).toContainText('E2E 满减券');
  await expect(shopperPage.getByTestId('confirm-coupon-discount')).toContainText('5.00');
  await expect(shopperPage.getByTestId('confirm-total')).toContainText('40.00');

  // And the picker lists it, marked as the one in use.
  await couponRow.click();
  await expect(
    shopperPage.getByTestId('coupon-option').filter({ hasText: 'E2E 满减券' }),
  ).toBeVisible();
});

test('a shopper submits the confirm page, pays at the cashier, and sees the order awaiting shipment', async ({
  shopperPage,
  shopperApi,
  shop,
}) => {
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
  // The headline prints `_status._msg` (商家正在备货中); the status itself
  // rides on the element: `_type` 1 is 待发货.
  await expect(shopperPage.getByTestId('order-status')).toHaveAttribute(
    'data-status-title',
    '待发货',
    { timeout: 15_000 },
  );
  await expect(shopperPage.getByTestId('order-status')).toHaveAttribute('data-status-type', '1');
});

test('a shopper adds a product to the cart from its page and the cart agrees', async ({
  shopperPage,
  shopperApi,
  shop,
}) => {
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
  // (the tab-bar badge), `quantity` counts units. The second add's toast is
  // indistinguishable from the first's, so poll the cart instead.
  await expect(async () => {
    const count = (await (await shopperApi.get('/api/v1/cart/count')).json()) as {
      items: number;
      quantity: number;
    };
    expect(count).toMatchObject({ items: 1, quantity: 2 });
  }).toPass({ timeout: 15_000 });

  await shopperPage.goto('/pages/order_addcart/order_addcart');
  const row = shopperPage.locator(
    `[data-testid="cart-row"][data-sku-id="${shop.fixtures.postageSkuId}"]`,
  );
  await expect(row).toContainText('E2E 运费商品');
  await expect(row.getByTestId('cart-qty').locator('input')).toHaveValue('2');
});
