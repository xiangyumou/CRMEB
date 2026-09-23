import type { ResponseOf } from '@shop/api-client';
import { TOKEN_KEY, useSession } from '@/session/session';
import { taroFake } from './taro-fake/taro';

/** A signed-in shopper, as a stored token would leave the app (no wx.login, no request). */
export function signIn(token = 't1'): void {
  taroFake.storage.set(TOKEN_KEY, token);
  useSession.setState({ session: { status: 'signed-in', token } });
}

export function signOut(): void {
  useSession.setState({ session: { status: 'signed-out' } });
}

export const profileFixture: ResponseOf<'user.getProfile'> = {
  id: '7',
  account: 'u7',
  phone: '13800138000',
  nickname: '小明',
  avatarUrl: null,
  realName: null,
  birthday: null,
  registerSource: 'wechat_mini',
  hasPassword: true,
  boundWechat: ['mini'],
  createdAt: '2026-09-01T10:00:00+08:00',
};

/** A `{ items, total, page, pageSize }` page of `items`. */
export function page<T>(items: T[]) {
  return { items, total: items.length, page: 1, pageSize: 20 };
}

/** A 422 body the way `handle()` sends one. */
export function rejected(code: string, message: string, status = 422) {
  return { status, body: { code, message } };
}
