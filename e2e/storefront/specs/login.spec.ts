import { codeKey } from '@shop/core/sms';

import { test, expect } from '../src/fixtures';
import type { Stack } from '../src/stack';
import { uniField } from '../src/uni';

/**
 * Journey 5 — Login.
 *
 * `pages/users/login/index.vue` defaults to the SMS ("快速登录") tab
 * (`current: 1`); `账号登录` switches to the password form. Both forms share
 * one phone-number-shaped input — verified literally by reading the file,
 * not guessed — so the password half of this journey logs in with the
 * seeded phone number, not the seeded `account` string (`e2e-shopper`
 * contains a hyphen, which fails the form's own account-format regex
 * `/^[\w\d]{5,16}$/i` before the request is even sent). The server accepts
 * either (`findByAccountOrPhone`), so this is not a workaround, just the
 * one of the two identifiers the form itself validates.
 *
 * The SMS half runs against the real, out-of-process `next start` server:
 * `SHOP_FAKE_SMS=1` (passed by `scripts/serve.ts`)
 * registers the fake sender in web's own module graph, and the code is read
 * back from Redis under the key `issueCode()` writes (`codeKey`). The page's
 * 获取验证码 refuses until the terms are ticked, so the box is ticked first.
 */

test('the terms checkbox blocks submission until it is checked', async ({ page, shop }) => {
  await page.goto('/pages/users/login/index');
  await page.getByText('账号登录', { exact: true }).click();
  await uniField(page, 'login-phone').fill(shop.users.primary.phone);
  await uniField(page, 'login-password').fill(shop.users.primary.password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByText('请先阅读并同意协议')).toBeVisible();
  // Still on the login page — nothing was submitted.
  await expect(page).toHaveURL(/users\/login/);
});

test('password login reaches an authenticated screen', async ({ page, shop }) => {
  await page.goto('/pages/users/login/index');
  await page.getByText('账号登录', { exact: true }).click();
  await uniField(page, 'login-phone').fill(shop.users.primary.phone);
  await uniField(page, 'login-password').fill(shop.users.primary.password);
  await page.getByTestId('login-terms').click();
  const session = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/auth/sessions/password' &&
      response.request().method() === 'POST',
  );
  await page.getByTestId('login-submit').click();
  expect((await session).ok()).toBe(true);
  // `toLogin`'s own back-url bookkeeping sends a fresh login (no prior page)
  // home; either way, the login form itself is gone …
  await expect(page).not.toHaveURL(/users\/login/, { timeout: 15_000 });
  // … and the token it stored really authenticates: the profile route
  // answers this shopper, not a 401.
  const profile = await page.evaluate(async () => {
    const token = window.localStorage.getItem('LOGIN_STATUS_TOKEN') ?? '';
    const response = await fetch('/api/v1/profile', {
      headers: { authorization: `Bearer ${token}` },
    });
    return { status: response.status, body: (await response.json()) as { phone?: string } };
  });
  expect(profile.status).toBe(200);
  expect(profile.body.phone).toBe(shop.users.primary.phone);
});

/** Reads the code `issueCode()` stored — `sms:code:<scene>:<phone>`, field `code`. */
async function issuedCode(shop: Stack, phone: string): Promise<string> {
  let code: string | null = null;
  await expect(async () => {
    code = await shop.redis.hget(codeKey('login', phone), 'code');
    expect(code, `no login code issued for ${phone}`).toMatch(/^\d{6}$/);
  }).toPass({ timeout: 10_000 });
  return code!;
}

test('a phone number receives an SMS code it can log in with', async ({ page, shop }) => {
  const phone = shop.users.primary.phone;
  await shop.redis.del(codeKey('login', phone), `sms:resend:login:${phone}`);
  await page.goto('/pages/users/login/index');
  await uniField(page, 'login-phone').fill(phone);
  // 获取验证码 refuses before the terms are ticked (`code()` checks `protocol` first).
  await page.getByTestId('login-terms').click();
  await page.getByTestId('login-send-code').click();
  await expect(page.getByText('发送成功', { exact: false })).toBeVisible();

  const code = await issuedCode(shop, phone);
  await uniField(page, 'login-code').fill(code);
  const session = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v1/auth/sessions/sms' &&
      response.request().method() === 'POST',
  );
  await page.getByTestId('login-submit').click();
  expect((await session).ok()).toBe(true);
  await expect(page).not.toHaveURL(/users\/login/, { timeout: 15_000 });
});

test('a wrong SMS code is rejected and the code stays usable', async ({ page, shop }) => {
  const phone = shop.users.secondary.phone;
  await shop.redis.del(codeKey('login', phone), `sms:resend:login:${phone}`);
  await page.goto('/pages/users/login/index');
  await uniField(page, 'login-phone').fill(phone);
  // 获取验证码 refuses before the terms are ticked (`code()` checks `protocol` first).
  await page.getByTestId('login-terms').click();
  await page.getByTestId('login-send-code').click();
  const code = await issuedCode(shop, phone);
  const wrong = code === '000000' ? '111111' : '000000';

  await uniField(page, 'login-code').fill(wrong);
  const session = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/v1/auth/sessions/sms',
  );
  await page.getByTestId('login-submit').click();
  expect((await session).status()).toBe(400);
  await expect(page.getByText('验证码不正确或已过期')).toBeVisible();
  await expect(page).toHaveURL(/users\/login/);

  // One wrong try costs an attempt, not the code.
  expect(await shop.redis.hget(codeKey('login', phone), 'attempts')).toBe('1');
});

test('a 401 mid-session redirects to login exactly once, not once per failed request', async ({
  page,
}) => {
  // A session that *believes* it is logged in (a token is in storage, the
  // way a real expired session looks to the app) but is not, from the
  // server's point of view — `utils/request.js`'s `loginPromptInFlight`
  // single-flight guard is the thing under test: `pages/user/index.vue`
  // fires more than one authenticated call on load (`getUserInfo` from both
  // `onLoad` and `onShow`), and only one of the resulting 401s may open the
  // login screen.
  await page.addInitScript(() => {
    // Same shape `seedToken` writes (`src/fixtures.ts`): bare string, wrapped tag list.
    window.localStorage.setItem('LOGIN_STATUS_TOKEN', 'e2e-deliberately-invalid-token');
    window.localStorage.setItem(
      'UNI-APP-CRMEB:TAG',
      JSON.stringify({ type: 'object', data: [{ key: 'LOGIN_STATUS_TOKEN', expire: 0 }] }),
    );
  });

  const loginNavigations: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame() && /users\/login/.test(frame.url()))
      loginNavigations.push(frame.url());
  });

  await page.goto('/pages/user/index');
  await expect(page).toHaveURL(/users\/login/, { timeout: 20_000 });
  // Give any further in-flight 401s from the same page load a moment to
  // resolve, so a second redirect (the bug this guards against) has time to
  // show up before the count is read.
  await page.waitForTimeout(2_000);
  expect(loginNavigations.length).toBe(1);
});
