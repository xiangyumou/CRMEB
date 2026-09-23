import { test, expect, cjk, dialog, toast } from '../src/fixtures';

/**
 * A coupon template, and one grant of it.
 *
 * The grant is the interesting half: it is the screen that hands out money,
 * it takes a free-text list of user ids, and the shop's stock is decremented
 * by it. A spec that only created the template would be testing a form.
 */

const NAME = `E2E 满减券 ${Date.now()}`;

test('create a coupon template and grant it to a buyer', async ({ adminPage, shop }) => {
  await adminPage.goto('/admin/coupon/templates');
  await adminPage.getByRole('button', { name: '新建优惠券' }).click();

  const modal = dialog(adminPage);
  await expect(modal.getByText('新建优惠券')).toBeVisible();
  await modal.getByLabel('名称').fill(NAME);
  await modal.getByLabel('面额').fill('10.00');

  // 进行中, or the storefront and the grant would both refuse it.
  await modal.getByLabel('状态', { exact: true }).click();
  await adminPage.getByTitle('进行中', { exact: true }).click();

  await modal.getByLabel('适用范围').click();
  await adminPage.getByTitle('全场通用', { exact: true }).click();

  await modal.getByLabel('发放方式').click();
  await adminPage.getByTitle('后台发放', { exact: true }).click();

  await modal.getByLabel('有效期方式').click();
  await adminPage.getByTitle('领取后生效', { exact: true }).click();
  await modal.getByLabel('领取后有效天数').fill('7');

  await modal.getByLabel('发放总量').fill('100');

  await modal.getByRole('button', { name: cjk('保存') }).click();
  await expect(modal).toBeHidden();
  await expect(adminPage.getByRole('cell', { name: NAME })).toBeVisible();

  // ---- 发放 ----
  const row = adminPage.getByRole('row').filter({ hasText: NAME });
  await row.getByRole('button', { name: cjk('发放') }).click();

  const grant = dialog(adminPage);
  await expect(grant.getByText('粘贴用户 ID')).toBeVisible();
  await grant.getByPlaceholder('1001 1002 1003').fill(String(shop.fixtures.userId));
  await grant.getByRole('button', { name: cjk('发放') }).click();
  await expect(toast(adminPage, '已发放 1 张')).toBeVisible();

  // ---- and it is on the buyer's record ----
  await adminPage.goto(`/admin/coupon/user-coupons?userId=${shop.fixtures.userId}`);
  await expect(adminPage.getByRole('cell', { name: NAME })).toBeVisible();
  await expect(adminPage.getByRole('cell', { name: '后台发放' })).toBeVisible();
});

test('a grant of nothing is refused before it reaches the server', async ({ adminPage }) => {
  await adminPage.goto('/admin/coupon/templates');
  const row = adminPage.getByRole('row').filter({ hasText: NAME });
  await row.getByRole('button', { name: cjk('发放') }).click();

  const grant = dialog(adminPage);
  await grant.getByRole('button', { name: cjk('发放') }).click();
  await expect(toast(adminPage, '请填写至少一个用户 ID')).toBeVisible();
  await expect(grant).toBeVisible();
});
