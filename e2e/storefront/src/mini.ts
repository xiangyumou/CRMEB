import { randomBytes } from 'node:crypto';

import type { Page } from '@playwright/test';

import { test as base } from './fixtures';

/**
 * Fixtures for `specs-mini/`: the Taro mini-program, built for H5 as
 * "模拟小程序" (`apps/mini/src/platform/h5-mp-emulation.tsx`), driven as a
 * shopper holding a phone with WeChat on it.
 *
 * What WeChat itself would decide on a phone — who is signed in to WeChat,
 * which number `getPhoneNumber` shares, whether the shopper confirms the
 * payment sheet — is test data here: `wechatUser`, written into the page's
 * `localStorage` before the app starts. Everything after that is the real
 * server: the page gets a `wx.login` code from the harness, the server
 * redeems it against the fake `api.weixin.qq.com`, places the payment on the
 * fake WeChat Pay gateway and learns it was paid from a signed notification.
 */

/** Must match `EMULATION_STORAGE_KEY` in `apps/mini/src/platform/h5-mp-emulation.tsx`. */
const EMULATION_STORAGE_KEY = '__shop_mp_emulation__';

/** Must match `TOKEN_KEY` in `apps/mini/src/features/session/session.ts`. */
const SESSION_TOKEN_KEY = 'shop.session.token';

export interface EmulatedWechatUser {
  openid: string;
  unionid?: string;
  /** What `getPhoneNumber` shares: 11 digits, no country code. */
  phone: string;
  /** What the shopper does with the payment sheet. Default `pay`. */
  payment?: 'pay' | 'cancel' | 'fail';
}

/** A WeChat user this run has never seen: a new openid and a number nobody registered. */
export function newWechatUser(overrides: Partial<EmulatedWechatUser> = {}): EmulatedWechatUser {
  const digits = BigInt(`0x${randomBytes(6).toString('hex')}`) % 100_000_000n;
  return {
    openid: `o_e2e_${randomBytes(10).toString('hex')}`,
    phone: `139${digits.toString().padStart(8, '0')}`,
    ...overrides,
  };
}

/** Makes `page` the phone of `user`, from its first navigation on. */
export async function holdPhone(page: Page, user: EmulatedWechatUser): Promise<void> {
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [
    EMULATION_STORAGE_KEY,
    JSON.stringify(user),
  ] as const);
}

/**
 * The bearer token the app stored after signing in. Taro's H5 `setStorageSync`
 * wraps a value as `{"data": …}`; the raw string is accepted too.
 */
export async function sessionToken(page: Page): Promise<string> {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), SESSION_TOKEN_KEY);
  if (!raw) throw new Error('the app has not stored a session token');
  try {
    const parsed = JSON.parse(raw) as { data?: unknown };
    if (typeof parsed.data === 'string') return parsed.data;
  } catch {
    // stored bare
  }
  return raw;
}

/** A Taro H5 route: the hash router, `/#/<page>?query`. */
export function miniRoute(pagePath: string, query: Record<string, string | number> = {}): string {
  const search = new URLSearchParams(
    Object.entries(query).map(([key, value]) => [key, String(value)]),
  ).toString();
  return `/#/${pagePath}${search ? `?${search}` : ''}`;
}

export interface MiniFixtures {
  /** The WeChat user holding this test's phone; a new one per test. */
  wechatUser: EmulatedWechatUser;
  /** `page` as that user's phone, with the page-health listeners attached. Not navigated yet. */
  miniPage: Page;
}

export const test = base.extend<MiniFixtures>({
  // eslint-disable-next-line no-empty-pattern
  wechatUser: async ({}, use) => {
    await use(newWechatUser());
  },

  // Depends on the health fixtures so their listeners see the first load.
  miniPage: async ({ page, wechatUser, consoleErrors, failedRequests }, use) => {
    void consoleErrors;
    void failedRequests;
    await holdPhone(page, wechatUser);
    await use(page);
  },
});

export { expect } from './fixtures';
