import { shipOrder } from '@shop/core/order';

import { test, expect, cjk, dialog, toast } from '../src/fixtures';

/**
 * 发货 → 确认收货, on a real paid order.
 *
 * `order.fulfil.concurrency.int.test.ts` proves shipping cannot outrun a
 * refund. What is only visible from here is that the shipping *form* refuses
 * to send an express parcel without a courier and a tracking number — the
 * refine that enforces it attaches its message to `发货方式`, two fields away
 * from where the operator is looking, which is exactly the sort of thing that
 * ships broken.
 */

test('an express shipment needs a courier and a tracking number', async ({ adminPage, shop }) => {
  await adminPage.goto(`/admin/orders/${shop.fixtures.shippableOrderId}`);
  await expect(adminPage.getByRole('heading', { name: /订单 E2E00000001/ })).toBeVisible();

  await adminPage.getByRole('button', { name: cjk('发货') }).click();
  const modal = dialog(adminPage);
  await expect(modal).toBeVisible();

  // Save with nothing filled in: the refine must stop it, and must say so.
  await modal.getByRole('button', { name: cjk('保存') }).click();
  await expect(modal).toBeVisible();
  await expect(modal.getByText('快递发货需要物流公司和运单号')).toBeVisible();
});

// CR-15-k found here: every `dedupeKey` is `name:id`, and BullMQ 6 refuses a
// custom job id with one colon in it, so this shipment used to commit and then
// answer 500 from the enqueue that follows it. `queue-bullmq.ts` now maps the
// port's opaque key onto a BullMQ id (`toJobId`); this journey is the proof that
// the fix holds at the HTTP boundary, on a real Redis, which no unit or
// integration suite reaches (they all run on `memoryQueue()`).
test('ship it, then confirm receipt', async ({ adminPage, adminApi, shop }) => {
  const orderId = shop.fixtures.shippableOrderId;
  await adminPage.goto(`/admin/orders/${orderId}`);

  await adminPage.getByRole('button', { name: cjk('发货') }).click();
  const modal = dialog(adminPage);
  await modal.getByLabel('物流公司').click();
  await adminPage.getByTitle('顺丰速运', { exact: true }).click();
  await modal.getByLabel('运单号').fill('SF1234567890');
  await modal.getByRole('button', { name: cjk('保存') }).click();
  // The modal closing is the assertion, not the toast: antd's message is
  // torn down when the page refetches, and a three-second banner is not
  // what the warehouse depends on.
  await expect(modal).toBeHidden();

  // The shipment is on the page, with the number that was typed — twice: the
  // shipment card and the timeline entry.
  await expect(adminPage.getByText('SF1234567890').first()).toBeVisible();

  // 确认收货 only appears once the order is shipped — it is in the page
  // header, not in the shipping card, and it is a Popconfirm.
  const confirm = adminPage.getByRole('button', { name: '确认收货' });
  await expect(confirm).toBeVisible();
  await confirm.click();
  await adminPage.getByRole('button', { name: cjk('确定') }).click();
  await expect(toast(adminPage, '已确认收货')).toBeVisible();

  // And the order really moved, not just the screen.
  const detail = await adminApi.get(`/admin-api/orders/${orderId}`);
  expect(detail.status()).toBe(200);
  const body = await detail.json();
  expect(['received', 'completed']).toContain(body.status);
  expect(body.fulfillmentStatus).toBe('fulfilled');

  // Shipping is an admin write, so it left an audit row naming the order.
  const audit = await adminApi.get('/admin-api/audit-logs?page=1&pageSize=20');
  expect(audit.status()).toBe(200);
  const targets = ((await audit.json()).items as Array<{ target: string | null }>).map(
    (row) => row.target,
  );
  expect(targets.some((target) => target?.includes(String(orderId)))).toBe(true);
});

test('an order that is already shipped cannot be shipped again', async ({
  adminPage,
  adminApi,
  shop,
}) => {
  const orderId = shop.fixtures.shippableOrderId!;
  // The journey above ships this order through the screen; when this test runs
  // on its own the arrangement is made through the service instead. `lines: []`
  // means "everything still outstanding", which is what 一键发货 sends.
  const before = await (await adminApi.get(`/admin-api/orders/${orderId}`)).json();
  if (before.status !== 'shipped' && before.fulfillmentStatus !== 'fulfilled') {
    await shipOrder(shop.ctx, {
      orderId,
      body: {
        deliveryMode: 'express',
        lines: [],
        expressCompanyId: String(shop.fixtures.expressCompanyId),
        trackingNo: 'SF1234567890',
      },
      operatorAdminId: shop.accounts.super!.id,
    });
  }

  await adminPage.goto(`/admin/orders/${orderId}`);
  // Every line is now on its way; the button is gone, because there is nothing
  // left to send.
  // Twice on the page: the shipment card and the timeline entry.
  await expect(adminPage.getByText('SF1234567890').first()).toBeVisible();
  await expect(adminPage.getByRole('button', { name: cjk('发货') })).toHaveCount(0);
});
