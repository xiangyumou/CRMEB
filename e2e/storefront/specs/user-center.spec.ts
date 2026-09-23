import type { APIRequestContext } from '@playwright/test';

import { test, expect } from '../src/fixtures';

/**
 * 我的 on a shop that never published a 个人中心 page.
 *
 * `src/seed.ts` publishes a home page and two micro pages but no `user_center`
 * page, so `GET /api/v1/diy/pages/user-center` answers the built-in default.
 * `pages/user/index.vue` has no body except that page. Without the default the
 * tab would show only the copyright image and the tab bar.
 *
 * Each component is located by the DOM id `pageDesign.vue` gives it
 * (`diy-<id>`), read off the page the route answers.
 */

interface ServedPage {
  id: unknown;
  kind: string;
  content: Record<string, { id: string; name: string; timestamp: number }>;
}

async function servedPage(api: APIRequestContext): Promise<ServedPage> {
  const response = await api.get('/api/v1/diy/pages/user-center');
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as ServedPage;
}

/** The four components' test ids, in render order. */
async function componentIds(api: APIRequestContext) {
  const nodes = Object.values((await servedPage(api)).content).sort(
    (a, b) => a.timestamp - b.timestamp,
  );
  expect(nodes.map(({ name }) => name)).toEqual(['member', 'titles', 'menus', 'menus']);
  const [member, title, orders, services] = nodes.map(({ id }) => `diy-${id}`);
  return { member: member!, title: title!, orders: orders!, services: services! };
}

test('the 个人中心 read answers the built-in page, not a 404', async ({ shopperApi }) => {
  expect(await servedPage(shopperApi)).toMatchObject({ id: null, kind: 'user_center' });
});

test('我的 shows the member header, the order row and 我的服务', async ({
  shopperPage,
  shopperApi,
  failedRequests,
}) => {
  const ids = await componentIds(shopperApi);

  const answered = shopperPage.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/api/v1/diy/pages/user-center'),
  );
  await shopperPage.goto('/pages/user/index');
  expect((await answered).status()).toBe(200);

  // The member header: its counts row reads 优惠券 / 收藏商品 / 浏览记录.
  const member = shopperPage.getByTestId(ids.member);
  await expect(member).toBeVisible({ timeout: 20_000 });
  await expect(member).toContainText('优惠券');
  await expect(member).toContainText('收藏商品');

  await expect(shopperPage.getByTestId(ids.title)).toContainText('订单中心');

  const orders = shopperPage.getByTestId(ids.orders);
  for (const label of ['待付款', '待发货', '待收货', '待评价', '售后']) {
    await expect(orders.getByText(label, { exact: true })).toBeVisible();
  }

  const services = shopperPage.getByTestId(ids.services);
  await expect(services).toContainText('我的服务');
  await expect(services.getByText('地址管理', { exact: true })).toBeVisible();

  // An entry works: 地址管理 opens the address list.
  await services.getByText('地址管理', { exact: true }).click();
  await expect(shopperPage).toHaveURL(/\/pages\/users\/user_address_list\/index/);

  expect(failedRequests.filter((line) => line.includes('/api/v1/diy/'))).toEqual([]);
});

test('a visitor who has not logged in sees the header ask them to', async ({
  page,
  shopperApi,
}) => {
  const ids = await componentIds(shopperApi);
  await page.goto('/pages/user/index');
  await expect(page.getByTestId(ids.member)).toContainText('请点击登录', { timeout: 20_000 });
  await expect(page.getByTestId(ids.orders)).toContainText('待付款');
});
