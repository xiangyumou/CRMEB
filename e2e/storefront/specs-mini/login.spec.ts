import { codeKey } from '@shop/core/sms';
import { userSessions } from '@shop/db/schema/auth';
import { users } from '@shop/db/schema/user';
import { wechatIdentities } from '@shop/db/schema/wechat';
import type { Page } from '@playwright/test';
import { and, eq, isNull } from 'drizzle-orm';

import { miniRoute, sessionToken, test, expect } from '../src/mini';
import type { Stack } from '../src/stack';
import { CartPage, openTab } from '../src/mini-pages/shopping-pages';
import {
  arrangeCartLine,
  cartQuantities,
  returningShopper,
  signedInToken,
} from '../src/mini-pages/shopping-shopper';
import { openFresh, shown } from '../src/mini-pages/shown';

/**
 * How a WeChat shopper gets and keeps a session in the mini-program (docs/mini/auth.md):
 * silently, with `wx.login`, when the shop knows the openid; with an SMS code when the shop
 * wants a phone number and WeChat's quick phone button is not used (手机号快速登录 itself is
 * `new-shopper-buys.spec.ts`'s); and, when the server stops honouring the token, renewed once
 * with a fresh `wx.login` and the failed request replayed — reads and writes alike.
 *
 * There is no password sign-in in the mini-program (the plan's 「其他方式」 was not built), so
 * the legacy `login.spec.ts` password case has no counterpart here; `docs/mini/e2e-coverage.md`
 * lists it as a gap.
 */

const MINI_LOGIN = '/api/v1/auth/sessions/wechat-mini';

/** Every `POST` to the mini sign-in the page makes from now on. */
function countSignIns(page: Page): { count: () => number } {
  let count = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === MINI_LOGIN) count += 1;
  });
  return { count: () => count };
}

/** Every API response the page gets from now on, as `METHOD /path STATUS`, in order. */
function recordApi(page: Page): string[] {
  const seen: string[] = [];
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/v1/'))
      seen.push(`${response.request().method()} ${url.pathname} ${response.status()}`);
  });
  return seen;
}

/** Reads the code `issueCode()` stored — `sms:code:<scene>:<phone>`, field `code`. */
async function issuedCode(shop: Stack, phone: string): Promise<string> {
  let code: string | null = null;
  await expect(async () => {
    code = await shop.redis.hget(codeKey('login', phone), 'code');
    expect(code, `no login code issued for ${phone}`).toMatch(/^\d{6}$/);
  }).toPass({ timeout: 10_000 });
  return code!;
}

test('a WeChat user the shop knows is signed in on opening the app, with no login page', async ({
  miniPage: page,
  wechatUser,
  shop,
  playwright,
  consoleErrors,
  failedRequests,
}) => {
  const signIns = countSignIns(page);
  const shopper = await returningShopper(page, wechatUser, shop, playwright);
  expect(page.url()).not.toMatch(/pages\/login/);
  expect(signIns.count()).toBe(1);

  // The token is the shopper's own: the profile answers with their number.
  const profile = await shopper.api.get('/api/v1/profile');
  expect(profile.status(), await profile.text()).toBe(200);
  expect(((await profile.json()) as { phone: string }).phone).toBe(wechatUser.phone);

  // The app reads the shopper's own data with it: the cart they filled elsewhere.
  await arrangeCartLine(shopper.api, shop.fixtures.postageSkuId);
  const cart = new CartPage(page);
  await openTab(page, '购物车');
  await expect(cart.row('E2E 运费商品')).toBeVisible();

  // A cold start keeps the stored token: no second wx.login.
  await openFresh(page, miniRoute('pages/index/index'));
  await openTab(page, '购物车');
  await expect(cart.row('E2E 运费商品')).toBeVisible();
  expect(signIns.count()).toBe(1);

  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
  await shopper.api.dispose();
});

test('a new WeChat user signs up with an SMS code, and a wrong code leaves the code usable', async ({
  miniPage: page,
  wechatUser,
  shop,
  consoleErrors,
}) => {
  const phone = wechatUser.phone;
  await shop.redis.del(codeKey('login', phone), `sms:resend:login:${phone}`);

  // The silent sign-in finds no account for this openid: the login page asks for a phone.
  await page.goto(miniRoute('pages/login/index'));
  await shown(page).getByRole('checkbox', { name: '我已阅读并同意用户协议和隐私政策' }).click();
  await shown(page).getByText('短信验证码登录', { exact: true }).click();
  await shown(page).locator('input[placeholder="请输入手机号"]').fill(phone);
  await shown(page).getByText('获取验证码', { exact: true }).click();
  await expect(shown(page).getByText(/秒后重发$/)).toBeVisible();
  const code = await issuedCode(shop, phone);

  // A wrong code is refused, counted, and the right one still works.
  const wrong = code === '000000' ? '111111' : '000000';
  await shown(page).locator('input[placeholder="请输入验证码"]').fill(wrong);
  await shown(page).locator('.login__actions').getByText('登录', { exact: true }).click();
  await expect(async () => {
    expect(await shop.redis.hget(codeKey('login', phone), 'attempts')).toBe('1');
  }).toPass({ timeout: 10_000 });
  await expect(page).toHaveURL(/pages\/login\/index/);

  await shown(page).locator('input[placeholder="请输入验证码"]').fill(code);
  await shown(page).locator('.login__actions').getByText('登录', { exact: true }).click();

  // Signed up, and back on 首页 (the login page had no redirect).
  await expect(page).toHaveURL(/pages\/index\/index/);
  await signedInToken(page);
  const [user] = await shop.db
    .select({ id: users.id, registerSource: users.registerSource })
    .from(users)
    .where(eq(users.phone, phone));
  expect(user, `no user with phone ${phone}`).toBeDefined();
  expect(user!.registerSource).toBe('wechat_mini');
  // The openid that asked is bound to the account, so the next wx.login signs straight in.
  const identities = await shop.db
    .select({ openid: wechatIdentities.openid, platform: wechatIdentities.platform })
    .from(wechatIdentities)
    .where(eq(wechatIdentities.userId, user!.id));
  expect(identities).toEqual([{ openid: wechatUser.openid, platform: 'mini' }]);
  // The code is spent.
  expect(await shop.redis.exists(codeKey('login', phone))).toBe(0);

  expect(consoleErrors).toEqual([]);
});

test('a session the server stopped honouring is renewed once, and the reads that failed are replayed', async ({
  miniPage: page,
  wechatUser,
  shop,
  playwright,
  consoleErrors,
  failedRequests,
}) => {
  const shopper = await returningShopper(page, wechatUser, shop, playwright);
  await arrangeCartLine(shopper.api, shop.fixtures.postageSkuId);
  const before = await sessionToken(page);

  // Signed out on the server (another device's 退出登录 everywhere, an expiry): the app still
  // holds the token and does not know.
  const revoked = await shopper.api.delete('/api/v1/auth/sessions');
  expect(revoked.ok(), await revoked.text()).toBe(true);

  const signIns = countSignIns(page);
  const api = recordApi(page);
  await openTab(page, '购物车');
  const cart = new CartPage(page);
  await expect(cart.row('E2E 运费商品')).toBeVisible();

  // One renewal for however many requests failed together, each failure replayed once.
  expect(signIns.count()).toBe(1);
  const failed = api.filter((line) => line.endsWith(' 401'));
  expect(failed.length).toBeGreaterThan(0);
  for (const line of failed) {
    const replay = line.replace(/ 401$/, ' 200');
    expect(api.slice(api.indexOf(line) + 1), `${line} was not replayed`).toContain(replay);
  }
  const after = await sessionToken(page);
  expect(after).not.toBe(before);

  // The new token is the account's one live session, minted for the mini-program.
  const live = await shop.db
    .select({ platform: userSessions.platform })
    .from(userSessions)
    .where(and(eq(userSessions.userId, shopper.userId), isNull(userSessions.revokedAt)));
  expect(live).toEqual([{ platform: 'wechat-mini' }]);
  expect(page.url()).not.toMatch(/pages\/login/);

  expect(consoleErrors).toEqual([]);
  // What failed is exactly the 401s the renewal answered.
  expect(failedRequests.length).toBe(failed.length);
  expect(failedRequests.every((line) => line.endsWith(' 401'))).toBe(true);
  await shopper.api.dispose();
});

test('a write that meets an expired session is replayed once after renewal, not lost or doubled', async ({
  miniPage: page,
  wechatUser,
  shop,
  playwright,
  consoleErrors,
}) => {
  const shopper = await returningShopper(page, wechatUser, shop, playwright);
  await arrangeCartLine(shopper.api, shop.fixtures.postageSkuId);
  const cart = new CartPage(page);
  await cart.open();
  await expect(cart.row('E2E 运费商品')).toBeVisible();

  // The server forgets the session while the cart is on screen.
  const revoked = await shopper.api.delete('/api/v1/auth/sessions');
  expect(revoked.ok(), await revoked.text()).toBe(true);
  const signIns = countSignIns(page);
  const api = recordApi(page);

  await cart.increase('E2E 运费商品').click();

  await expect(async () => {
    const token = await sessionToken(page);
    const probe = await playwright.request.newContext({
      baseURL: shop.baseUrl,
      extraHTTPHeaders: { Authorization: `Bearer ${token}`, 'X-Client-Platform': 'wechat-mini' },
    });
    const quantities = await cartQuantities(probe);
    await probe.dispose();
    expect(quantities.get(String(shop.fixtures.postageSkuId))).toBe(2);
  }).toPass({ timeout: 10_000 });
  await expect(cart.bar()).toContainText('结算(2)');

  expect(signIns.count()).toBe(1);
  const writes = api.filter((line) => /^(POST|PUT|PATCH|DELETE) \/api\/v1\/cart\//.test(line));
  expect(writes.filter((line) => line.endsWith(' 401'))).toHaveLength(1);
  expect(writes.filter((line) => / 2\d\d$/.test(line))).toHaveLength(1);
  // Still 2 a moment later: the replay was the only one. (A fresh API context: the shopper's
  // old one holds the revoked token.)
  const fresh = await playwright.request.newContext({
    baseURL: shop.baseUrl,
    extraHTTPHeaders: {
      Authorization: `Bearer ${await signedInToken(page)}`,
      'X-Client-Platform': 'wechat-mini',
    },
  });
  expect((await cartQuantities(fresh)).get(String(shop.fixtures.postageSkuId))).toBe(2);

  expect(consoleErrors).toEqual([]);
  await fresh.dispose();
  await shopper.api.dispose();
});
