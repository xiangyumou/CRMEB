import {
  test as base,
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';

import { DEVICE } from './device';
import { completePayment, completeRefund } from './gateway-control';
import { BASE_URL, type SeededUser } from './stack-file';
import { stack, closeStack, type Stack } from './stack';

/**
 * The `test` every spec imports.
 *
 * `@shop/e2e-admin` gets by with three fixtures because the admin is one
 * identity behind one cookie. The storefront journeys need more: a shopper
 * that is already logged in for the six journeys that are not *about*
 * logging in, a second shopper only the group-buy journey needs, and an
 * admin session for the two steps (ship, refund-approve) no storefront
 * screen performs.
 */

export interface Fixtures {
  /** A page pre-authenticated as `shop.users.primary`, sitting on `/`. */
  shopperPage: Page;
  /** Same identity, for calls a browser cannot make cheaply. */
  shopperApi: APIRequestContext;
  /** A second, independently logged-in shopper — the group-buy partner. */
  secondaryShopperPage: Page;
  secondaryShopperApi: APIRequestContext;
  /** The super admin, cookie-authenticated against `/admin-api` — ship and refund-approve. */
  adminApi: APIRequestContext;
  /**
   * Every `console.error`/`pageerror` the test's own `page` (which is
   * `shopperPage`) has seen, in order, from before its first navigation.
   * The browser's own "Failed to load resource" echo is left out: the
   * request it echoes is in `failedRequests`, with the URL the console
   * message does not carry.
   */
  consoleErrors: string[];
  /**
   * Every request `page` made that failed — `METHOD /path STATUS`, or
   * `METHOD /path FAILED <reason>` for a transport error. Journey 1's
   * "renders without console error and without failed requests" and the
   * per-journey log the brief asks CI to keep (attached to every test as
   * `page-health.txt`) both read these two arrays.
   */
  failedRequests: string[];
}

// A 1x1 PNG.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

/**
 * Keeps a browser context offline. The DIY fixtures are real production page
 * data and still point their pictures at the production CDN; a run must never
 * reach it, and must not fail because it cannot. Anything not addressed to
 * the stack's own origin is answered locally — an image with a pixel,
 * anything else with an empty 204.
 */
export async function keepOffline(context: BrowserContext): Promise<void> {
  const local = new URL(BASE_URL).host;
  await context.route(
    (url) => (url.protocol === 'http:' || url.protocol === 'https:') && url.host !== local,
    (route) =>
      route.request().resourceType() === 'image'
        ? route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL })
        : route.fulfill({ status: 204, body: '' }),
  );
}

export interface WorkerFixtures {
  shop: Stack;
}

/** `POST /api/v1/auth/sessions/password` — the storefront analogue of `@shop/e2e-admin`'s `loginCookies`. */
export async function passwordLogin(request: APIRequestContext, user: SeededUser): Promise<string> {
  const response = await request.post('/api/v1/auth/sessions/password', {
    data: { account: user.account, password: user.password },
  });
  expect(
    response.ok(),
    `login as ${user.account} failed: ${response.status()} ${await response.text()}`,
  ).toBe(true);
  const body = (await response.json()) as { token: string };
  return body.token;
}

async function loginCookies(
  request: APIRequestContext,
  account: string,
  password: string,
): Promise<void> {
  const response = await request.post('/admin-api/auth/login', { data: { account, password } });
  expect(response.ok(), `admin login failed: ${response.status()} ${await response.text()}`).toBe(
    true,
  );
}

/**
 * The exact localStorage shape a real password login leaves behind — read off
 * a browser after logging in through `pages/users/login`, not reconstructed
 * from the source. `uni.setStorageSync` on H5 stores a string as the raw
 * string and anything else as `{"type": …, "data": …}`, so the token is bare
 * and `utils/cache.js`'s expiry tag list is wrapped. `expire: 0` is how
 * `Cache` spells "never", and `store/modules/app.js` reads the token at
 * module-init time (`Cache.get(LOGIN_STATUS) || false`) — so a page
 * navigated to *after* this script runs boots already logged in, the way a
 * returning shopper's browser would, without paying for the login UI on
 * every spec that is not about login itself (`specs/login.spec.ts` is).
 */
export async function seedToken(page: Page, token: string): Promise<void> {
  await page.addInitScript(
    ([tokenValue]) => {
      window.localStorage.setItem('LOGIN_STATUS_TOKEN', tokenValue);
      window.localStorage.setItem(
        'UNI-APP-CRMEB:TAG',
        JSON.stringify({ type: 'object', data: [{ key: 'LOGIN_STATUS_TOKEN', expire: 0 }] }),
      );
    },
    [token] as const,
  );
}

export const test = base.extend<Fixtures & { localOnly: undefined }, WorkerFixtures>({
  // Not `offline`: that name is Playwright's own context option.
  localOnly: [
    async ({ context }, use) => {
      await keepOffline(context);
      await use(undefined);
    },
    { auto: true },
  ],

  shop: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await use(await stack());
      await closeStack();
    },
    { scope: 'worker' },
  ],

  shopperApi: async ({ playwright, shop }, use) => {
    const request = await playwright.request.newContext({ baseURL: BASE_URL });
    const token = await passwordLogin(request, shop.users.primary);
    await request.dispose();
    const authed = await playwright.request.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    await use(authed);
    await authed.dispose();
  },

  consoleErrors: async ({ page }, use, testInfo) => {
    const errors: string[] = [];
    // An unhandled rejection reaches Playwright as a `pageerror` with an
    // empty message whenever the app rejects with a plain object — which is
    // what `utils/request.js` rejects with on every non-2xx. Reported here
    // instead, once, with the reason spelled out; `preventDefault` stops the
    // browser reporting the same rejection a second time, empty.
    await page.addInitScript(() => {
      window.addEventListener('unhandledrejection', (event) => {
        const reason: unknown = event.reason;
        let text: string;
        if (reason instanceof Error) text = `${reason.name}: ${reason.message}`;
        else {
          try {
            text = JSON.stringify(reason) ?? String(reason);
          } catch {
            text = String(reason);
          }
        }
        event.preventDefault();
        console.error(`unhandledrejection ${text}`);
      });
    });
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      if (message.text().startsWith('Failed to load resource:')) return;
      // `console.error(someObject)` reaches Playwright as the text "Object";
      // the recorded line is upgraded to the serialised arguments once they
      // resolve, so the log says *what* the app complained about.
      const index = errors.push(message.text()) - 1;
      void Promise.all(
        message.args().map((arg) =>
          arg.jsonValue().then(
            (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value)),
            () => arg.toString(),
          ),
        ),
      ).then((parts) => {
        if (parts.length > 0) errors[index] = parts.join(' ');
      });
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await use(errors);
    await testInfo.attach('console-errors.txt', {
      body: errors.join('\n') || '(none)',
      contentType: 'text/plain',
    });
  },

  failedRequests: async ({ page }, use, testInfo) => {
    const failed: string[] = [];
    const describe = (method: string, url: string): string => {
      const parsed = new URL(url);
      return parsed.origin === new URL(BASE_URL).origin
        ? `${method} ${parsed.pathname}`
        : `${method} ${url}`;
    };
    page.on('response', (response) => {
      if (response.status() >= 400)
        failed.push(
          `${describe(response.request().method(), response.url())} ${response.status()}`,
        );
    });
    page.on('requestfailed', (request) => {
      // A navigation away from the app aborts whatever the page was still
      // loading; that is the test moving on, not the page failing.
      if (request.failure()?.errorText === 'net::ERR_ABORTED') return;
      failed.push(
        `${describe(request.method(), request.url())} FAILED ${request.failure()?.errorText}`,
      );
    });
    await use(failed);
    await testInfo.attach('failed-requests.txt', {
      body: failed.join('\n') || '(none)',
      contentType: 'text/plain',
    });
  },

  // Depends on the two health fixtures so their listeners exist before the
  // first `goto` — journey 1 asserts on what the very first load did.
  shopperPage: async ({ page, playwright, shop, consoleErrors, failedRequests }, use) => {
    void consoleErrors;
    void failedRequests;
    const request = await playwright.request.newContext({ baseURL: BASE_URL });
    const token = await passwordLogin(request, shop.users.primary);
    await request.dispose();
    await seedToken(page, token);
    await page.goto('/');
    await use(page);
  },

  secondaryShopperApi: async ({ playwright, shop }, use) => {
    const request = await playwright.request.newContext({ baseURL: BASE_URL });
    const token = await passwordLogin(request, shop.users.secondary);
    await request.dispose();
    const authed = await playwright.request.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    await use(authed);
    await authed.dispose();
  },

  secondaryShopperPage: async ({ browser, playwright, shop }, use) => {
    // A second phone, not a desktop: the same device, locale and base URL
    // the project gives the default `page`.
    const context = await browser.newContext({
      ...DEVICE,
      baseURL: BASE_URL,
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    });
    await keepOffline(context);
    const page = await context.newPage();
    const request = await playwright.request.newContext({ baseURL: BASE_URL });
    const token = await passwordLogin(request, shop.users.secondary);
    await request.dispose();
    await seedToken(page, token);
    await page.goto('/');
    await use(page);
    await context.close();
  },

  adminApi: async ({ playwright, shop }, use) => {
    const request = await playwright.request.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: { origin: BASE_URL },
    });
    await loginCookies(request, shop.admin.account, shop.admin.password);
    await use(request);
    await request.dispose();
  },
});

export { expect };

/**
 * Drives the fake gateway's async notification, the same call a real WeChat
 * Pay completion would make against `/api/v1/webhooks/wechat-pay` — see
 * `src/gateway-control.ts` for why this cannot be `shop`'s in-process
 * `FakeWechatGateway` object directly (it lives in `scripts/serve.ts`'s
 * process, not this one).
 */
export async function payOrder(shop: Stack, outTradeNo: string): Promise<void> {
  await completePayment(shop.gatewayControlUrl, outTradeNo);
}

export async function refundOrder(shop: Stack, outRefundNo: string): Promise<void> {
  await completeRefund(shop.gatewayControlUrl, outRefundNo);
}

/**
 * Polls until `assertion` stops throwing, for the handful of places a spec
 * has to wait on the real worker (started by `scripts/serve.ts`) to finish
 * processing a queued effect — there is no UI signal for "the job ran".
 */
export async function waitFor(assertion: () => Promise<void>, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await assertion();
      return;
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
}
