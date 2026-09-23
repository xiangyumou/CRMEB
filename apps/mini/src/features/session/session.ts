import { create } from 'zustand';
import { isApiError, type ResponseOf } from '@shop/api-client';
import { api, installAuth } from '@/data/api';
import { platform, storage } from '@/platform';

/**
 * The shopper's session: silent WeChat sign-in at launch, and the phone-number step when the
 * shop requires one (`requirePhoneForWechat`, on by default).
 *
 *   launch ── wx.login ──▶ POST /auth/sessions/wechat-mini
 *                              ├─ signed-in ─────────────────────────▶ token stored
 *                              └─ phone-required (bindToken) ── tap 手机号快速登录
 *                                   └─ POST /auth/sessions/wechat-mini/phone ──▶ token stored
 *
 * A page never redirects to a login page on its own (C05); it shows `<LoginCard>` where the
 * signed-in content would be.
 *
 * TODO(stream A): agreement consent before the phone step (C05), `pages/login/index` for SMS
 * and password sign-in, and the session's user profile.
 */

export type Session =
  | { status: 'idle' }
  | { status: 'signing-in' }
  | { status: 'signed-in'; token: string }
  | { status: 'phone-required'; bindToken: string }
  | { status: 'failed'; message: string };

const TOKEN_KEY = 'shop.session.token';

export const useSession = create<{ session: Session }>()(() => ({
  session: { status: 'idle' },
}));

function set(session: Session): void {
  useSession.setState({ session });
}

function current(): Session {
  return useSession.getState().session;
}

installAuth({
  getToken: () => {
    const session = current();
    return session.status === 'signed-in' ? session.token : null;
  },
  onUnauthorized: () => {
    // The token expired or was revoked: forget it and sign in again, silently.
    storage.remove(TOKEN_KEY);
    set({ status: 'idle' });
    void startSession();
  },
});

type WechatLoginResult = ResponseOf<'auth.miniLogin'>;

function apply(result: WechatLoginResult): void {
  if (result.status === 'signed-in' && result.session) {
    storage.set(TOKEN_KEY, result.session.token);
    set({ status: 'signed-in', token: result.session.token });
  } else if (result.status === 'phone-required' && result.bindToken) {
    set({ status: 'phone-required', bindToken: result.bindToken });
  } else {
    set({ status: 'failed', message: '登录失败，请重试' });
  }
}

function messageOf(error: unknown): string {
  if (isApiError(error)) return error.message;
  return error instanceof Error ? error.message : String(error);
}

let inFlight: Promise<void> | null = null;

/** Sign in if not already: a stored token, else `wx.login`. Concurrent calls share one run. */
export function startSession(): Promise<void> {
  inFlight ??= signIn().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function signIn(): Promise<void> {
  const state = current();
  if (state.status === 'signed-in' || state.status === 'phone-required') return;
  const stored = storage.get(TOKEN_KEY);
  if (stored) {
    set({ status: 'signed-in', token: stored });
    return;
  }
  set({ status: 'signing-in' });
  try {
    const code = await platform.login();
    apply(await api.call('auth.miniLogin', { body: { code } }));
  } catch (error) {
    set({ status: 'failed', message: messageOf(error) });
  }
}

/**
 * Finish a `phone-required` sign-in with the code from the phone-number button. Rejects only
 * when WeChat refused the code and the shopper can simply tap again (the caller shows why).
 */
export async function bindPhone(phoneCode: string): Promise<void> {
  const state = current();
  if (state.status !== 'phone-required') return;
  set({ status: 'signing-in' });
  try {
    apply(
      await api.call('auth.miniPhoneLogin', {
        body: { bindToken: state.bindToken, phoneCode },
      }),
    );
  } catch (error) {
    if (isApiError(error, 'auth.miniPhoneLogin') && error.code === 'AUTH_WECHAT_BIND_EXPIRED') {
      // The parked sign-in timed out: start over with a fresh wx.login code.
      set({ status: 'idle' });
      await startSession();
      return;
    }
    if (
      isApiError(error, 'auth.miniPhoneLogin') &&
      (error.code === 'AUTH_WECHAT_CODE_INVALID' || error.code === 'AUTH_WECHAT_UNAVAILABLE')
    ) {
      // WeChat refused the phone code, but the bindToken is still good (AUTH-007): let the
      // shopper tap again. TODO(stream A): offer the SMS route here too (docs/mini/auth.md).
      set({ status: 'phone-required', bindToken: state.bindToken });
      throw error;
    }
    set({ status: 'failed', message: messageOf(error) });
  }
}
