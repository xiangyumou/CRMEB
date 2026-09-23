import type { ConsoleMessage, Page } from '@playwright/test';

import { test, expect, cjk } from '../src/fixtures';

/**
 * The browser smoke: the login page renders, the shell renders for a real
 * session, and every tab of the kit demo page leaves the console clean.
 *
 * `curl` can prove the server did not throw; it cannot prove the browser did
 * not. That is why this runs in a browser, and why the suite runs a
 * *production* build — `next dev`
 * would fill the console with React's development warnings and the assertion
 * would have to be watered down until it asserted nothing.
 */

/**
 * Noise this suite refuses to fail on, each with the reason it is not a defect.
 * The list is compared exactly and may only shrink; an entry that stops
 * matching anything is a sign the underlying warning was fixed and the entry
 * should go.
 */
const TOLERATED = [
  // Chrome prints this for any request the page makes to a route that answers
  // 4xx — which the specs do on purpose. The assertion that matters is the
  // response code, and it is made where the request is made.
  /Failed to load resource: the server responded with a status of 4\d\d/,
] as const;

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  const record = (text: string) => {
    if (!TOLERATED.some((pattern) => pattern.test(text))) errors.push(text);
  };
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') record(message.text());
  });
  page.on('pageerror', (error) => record(`pageerror: ${error.message}`));
  return errors;
}

test('the login page renders in a browser, with nothing in the console', async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto('/admin/login');

  await expect(page.getByRole('heading', { name: '商城管理后台' })).toBeVisible();
  await expect(page.getByLabel('账号')).toBeVisible();
  await expect(page.getByLabel('密码')).toBeVisible();
  await expect(page.getByRole('button', { name: cjk('登录') })).toBeEnabled();
  // The slider slot is empty until a captcha provider registers one, and an
  // unregistered captcha must not render a dead field.
  await expect(page.getByLabel('安全验证')).toHaveCount(0);

  expect(errors, errors.join('\n')).toEqual([]);
});

test('the shell renders for a real session, with nothing in the console', async ({
  page,
  shop,
}) => {
  const errors = collectErrors(page);

  await page.goto('/admin/login');
  await page.getByLabel('账号').fill(shop.accounts.super!.account);
  await page.getByLabel('密码').fill(shop.accounts.super!.password);
  await page.getByRole('button', { name: cjk('登录') }).click();

  await expect(page).toHaveURL(/\/admin$/);
  // The three pieces of chrome only a browser can see: the sider, the
  // bell (which opens an SSE stream and must stay quiet when it 404s), and
  // the account menu.
  await expect(page.getByRole('link', { name: '商城管理后台' })).toBeVisible();
  await expect(page.getByTestId('notification-bell')).toBeVisible();
  await expect(page.getByTestId('user-menu')).toBeVisible();
  await expect(page.getByRole('menu')).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});

test('every tab of the kit demo mounts without a console error', async ({ adminPage }) => {
  const errors = collectErrors(adminPage);

  await adminPage.goto('/admin/dev/kit');
  await expect(adminPage.getByRole('heading', { name: '组件套件演示' })).toBeVisible();

  // The five tabs, in the order `kit-demo.tsx` declares them. Naming them
  // rather than enumerating what the DOM happens to contain is deliberate: a
  // tab that silently disappeared would otherwise pass this test.
  for (const name of [
    'CrudTable',
    'ZodForm',
    'AssetPicker / LinkPicker',
    'ConfigGroupForm',
    '展示组件',
  ]) {
    await adminPage.getByRole('tab', { name }).click();
    await expect(adminPage.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
    // Let the tab's queries settle; a component that throws on data arrival
    // would otherwise be measured before it had any.
    await adminPage.waitForTimeout(300);
  }

  expect(errors, errors.join('\n')).toEqual([]);
});

test('the health endpoint answers before anything else does', async ({ request }) => {
  const response = await request.get('/api/v1/health');
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ status: 'ok', version: 'e2e' });
});
