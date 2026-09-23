import { addressCreate } from '@shop/core/user';
import { userSessions } from '@shop/db/schema/auth';
import { paymentAttempts } from '@shop/db/schema/payment';
import { users } from '@shop/db/schema/user';
import { wechatIdentities } from '@shop/db/schema/wechat';
import { eq } from 'drizzle-orm';

import { miniRoute, sessionToken, test, expect } from '../src/mini';
import { userActor } from '../src/seed';

/**
 * The mini-program's first journey, end to end: a WeChat user who has never
 * opened the shop lands on a product from a shared link, is signed in
 * silently, shares their phone number to finish signing up, buys the product
 * and pays.
 *
 * Every step is the real server. Only what WeChat itself does on a phone is
 * the harness's: the `wx.login` and `getPhoneNumber` codes (redeemed by the
 * server against the fake `api.weixin.qq.com`) and the shopper confirming
 * the payment sheet (the fake WeChat Pay gateway settles the transaction the
 * server placed and posts the signed notification to the real webhook).
 *
 * The postage product costs ¥39 plus ¥6 freight to the seeded 深圳 division,
 * so one unit is ¥45.00; a checkout that dropped the freight shows ¥39.00.
 */
test('a new WeChat user signs in, binds a phone, buys a product and pays', async ({
  miniPage: page,
  wechatUser,
  shop,
  playwright,
  consoleErrors,
  failedRequests,
}) => {
  const productId = shop.fixtures.postageProductId;

  // A shared product link opens the app straight on 商品详情.
  await page.goto(miniRoute('pages/product/index', { id: productId }));
  await expect(page.getByText('E2E 运费商品')).toBeVisible();

  // The silent wx.login found no account for this openid: the shop wants a
  // phone number first, and says so where 立即购买 will be.
  await expect(page.getByText('登录后即可购买')).toBeVisible();
  await page.getByText('手机号快速登录', { exact: true }).click();
  const buy = page.getByText('立即购买', { exact: true });
  await expect(buy).toBeVisible();

  // The account exists now, made by the phone step, from the mini-program.
  const [user] = await shop.db
    .select({ id: users.id, registerSource: users.registerSource })
    .from(users)
    .where(eq(users.phone, wechatUser.phone));
  expect(user, `no user with phone ${wechatUser.phone}`).toBeDefined();
  expect(user!.registerSource).toBe('wechat_mini');
  const identities = await shop.db
    .select({ openid: wechatIdentities.openid, platform: wechatIdentities.platform })
    .from(wechatIdentities)
    .where(eq(wechatIdentities.userId, user!.id));
  expect(identities).toEqual([{ openid: wechatUser.openid, platform: 'mini' }]);
  const sessions = await shop.db
    .select({ platform: userSessions.platform })
    .from(userSessions)
    .where(eq(userSessions.userId, user!.id));
  expect(sessions.map((session) => session.platform)).toEqual(['wechat-mini']);

  // 导入微信地址 is not built yet (stream A); the new shopper's address is
  // arranged the way the admin suite arranges what a journey is not about.
  await addressCreate(shop.ctx.as(userActor(user!.id)), {
    receiverName: '小程序新客',
    receiverPhone: wechatUser.phone,
    ...shop.fixtures.division,
    provinceName: '广东省',
    cityName: '深圳市',
    districtName: '南山区',
    detail: '科技园路 3 号',
    isDefault: true,
  });

  await buy.click();
  await expect(page.getByText('小程序新客')).toBeVisible();
  await expect(page.getByText('实付 ¥45.00')).toBeVisible();
  await page.getByText('提交订单', { exact: true }).click();

  // 收银台 replaces 确认订单, so 返回 cannot resubmit.
  await expect(page).toHaveURL(/packages\/order\/cashier\/index\?orderId=\d+/);
  const orderId = new URL(page.url().replace('/#/', '/')).searchParams.get('orderId')!;
  await expect(page.getByText('¥45.00')).toBeVisible();
  await page.getByText('微信支付', { exact: true }).click();

  // requestPayment "succeeded"; the page believes the server, not the sheet.
  await expect(page).toHaveURL(/packages\/order\/pay-result\/index\?orderId=\d+&outTradeNo=/);
  await expect(page.getByText('支付成功')).toBeVisible();

  // The order is paid, as the shopper's own API sees it.
  const api = await playwright.request.newContext({
    baseURL: shop.baseUrl,
    extraHTTPHeaders: {
      Authorization: `Bearer ${await sessionToken(page)}`,
      'X-Client-Platform': 'wechat-mini',
    },
  });
  const response = await api.get(`/api/v1/orders/${orderId}`);
  expect(response.ok(), await response.text()).toBe(true);
  const order = (await response.json()) as {
    status: string;
    payableAmount: string;
    paidAmount: string | null;
  };
  expect(order).toMatchObject({ status: 'paid', payableAmount: '45.00', paidAmount: '45.00' });
  await api.dispose();

  // Charged as a mini-program payment, to the mini-program's app id.
  const attempts = await shop.db
    .select({ channel: paymentAttempts.channel, appId: paymentAttempts.appId })
    .from(paymentAttempts)
    .where(eq(paymentAttempts.orderId, Number(orderId)));
  expect(attempts).toEqual([{ channel: 'wechat_mini', appId: shop.wechatMiniAppId }]);

  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});
