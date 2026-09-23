import { create } from 'zustand';
import { isApiError, type ResponseOf } from '@shop/api-client';
import type { StorefrontRoute } from '@shop/api-client/routes';
import { api, installAuth } from '@/data/api';
import { navigate, platform, showToast, storage, useLaunchContext } from '@/platform';

/**
 * The shopper's session (docs/mini/auth.md): silent WeChat sign-in at launch, the phone-number
 * step when the shop requires one, renewal on a 401, and sign-out.
 *
 *   launch ── wx.login ──▶ POST /auth/sessions/wechat-mini
 *                              ├─ signed-in ──────────────────────────────▶ token stored
 *                              └─ phone-required (bindToken, 10 min)
 *                                   ├─ 手机号快速登录 ─▶ POST …/wechat-mini/phone ─▶ token stored
 *                                   └─ 短信验证码 ─────▶ POST …/wechat-oa/phone ───▶ token stored
 *
 * Browsing never needs a session (C05): a page shows `<LoginCard>` where signed-in content
 * would be, and an action that needs one calls `requireLogin()` first. Nothing here navigates
 * on its own, except `requireLogin` opening the login page when the shopper must act.
 */

export type Session =
  | { status: 'idle' }
  | { status: 'signing-in' }
  | { status: 'signed-in'; token: string }
  | { status: 'phone-required'; bindToken: string }
  | { status: 'failed'; message: string }
  /** Signed out on purpose: no silent sign-in until an action asks for one. */
  | { status: 'signed-out' };

export const TOKEN_KEY = 'shop.session.token';

export const useSession = create<{ session: Session }>()(() => ({
  session: { status: 'idle' },
}));

type Listener = (session: Session, previous: Session) => void;
const listeners = new Set<Listener>();

/** Called on every change; the query cache uses it to drop a signed-out shopper's data. */
export function onSessionChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function set(session: Session): void {
  const previous = current();
  useSession.setState({ session });
  for (const listener of listeners) listener(session, previous);
}

function current(): Session {
  return useSession.getState().session;
}

/** The bearer token, or `null` when not signed in. */
export function currentToken(): string | null {
  const session = current();
  return session.status === 'signed-in' ? session.token : null;
}

/** Whether the shopper is signed in (a hook). */
export function useSignedIn(): boolean {
  return useSession((state) => state.session.status === 'signed-in');
}

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
  await wechatSignIn();
}

async function wechatSignIn(): Promise<void> {
  set({ status: 'signing-in' });
  try {
    const code = await platform.login();
    apply(await api.call('auth.miniLogin', { body: { code } }));
  } catch (error) {
    set({ status: 'failed', message: messageOf(error) });
  }
}

let renewing: Promise<string | null> | null = null;

/**
 * A 401 on a request that carried a token (auth.md「401：续期」): drop the token, sign in again
 * with a fresh `wx.login` code, and hand back the new token for the one replay, or `null`
 * (phone-required, or the renewal failed; the original 401 stands). Requests that 401 together
 * share one renewal. Renewal calls only public routes, so it cannot recurse.
 */
export function renewSession(): Promise<string | null> {
  renewing ??= (async () => {
    storage.remove(TOKEN_KEY);
    await wechatSignIn();
    return currentToken();
  })().finally(() => {
    renewing = null;
  });
  return renewing;
}

installAuth({
  getToken: currentToken,
  renew: renewSession,
  onUnauthorized: () => {
    // Renewal already ran (or there was no token to renew): do not loop. The next action that
    // needs a session starts again through `requireLogin`.
    if (current().status === 'signed-in') {
      storage.remove(TOKEN_KEY);
      set({ status: 'idle' });
    }
  },
});

/**
 * Finish a `phone-required` sign-in with the code from the phone-number button. Rejects only
 * when the shopper can act on it (tap again, or switch to SMS): the caller shows why.
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
    await afterBindFailure(error, state.bindToken);
  }
}

/**
 * The SMS alternative (auth.md 方式二): the code must be minted with `scene: 'login'`, there
 * being no session yet. Resolves with the seconds before another code may be asked for.
 */
export async function sendLoginSms(phone: string): Promise<number> {
  const result = await api.call('auth.sendSmsCode', { body: { phone, scene: 'login' } });
  return result.resendAfterSec;
}

/**
 * Finish a `phone-required` sign-in with an SMS code. `auth.oaPhoneLogin` completes any parked
 * WeChat sign-in and binds the mini-program openid, so the next launch is silent; do not use
 * `auth.smsLogin`, which would not bind it (auth.md).
 */
export async function bindPhoneWithSms(phone: string, code: string): Promise<void> {
  const state = current();
  if (state.status !== 'phone-required') return;
  set({ status: 'signing-in' });
  try {
    apply(
      await api.call('auth.oaPhoneLogin', { body: { bindToken: state.bindToken, phone, code } }),
    );
  } catch (error) {
    await afterBindFailure(error, state.bindToken);
  }
}

/** Codes after which the parked sign-in is still good and the shopper can try again. */
const RETRYABLE = new Set([
  'AUTH_WECHAT_CODE_INVALID',
  'AUTH_WECHAT_UNAVAILABLE',
  'AUTH_SMS_CODE_INVALID',
  'AUTH_SMS_CODE_ATTEMPTS_EXCEEDED',
  'AUTH_WECHAT_ALREADY_BOUND',
]);

/** What a failed bind leaves behind (AUTH-007: most failures keep the bindToken). */
async function afterBindFailure(error: unknown, bindToken: string): Promise<void> {
  if (isApiError(error) && error.code === 'AUTH_WECHAT_BIND_EXPIRED') {
    // The parked sign-in timed out: start over with a fresh wx.login code.
    await wechatSignIn();
    return;
  }
  if (isApiError(error) && (RETRYABLE.has(error.code) || error.status === 0)) {
    set({ status: 'phone-required', bindToken });
    throw error;
  }
  set({ status: 'failed', message: messageOf(error) });
}

/**
 * Before an action that needs a session (加入购物车, 立即购买, 领券…). Resolves `true` when
 * signed in, silently signing in first if it can. Otherwise, when the shopper must act (bind a
 * phone number), opens the login page, which comes back to `redirect` afterwards, and resolves
 * `false`: the caller stops there.
 */
export async function requireLogin(redirect?: StorefrontRoute): Promise<boolean> {
  if (useLaunchContext.getState().isTimelineSinglePage) {
    // 朋友圈单页 (C10): no login there; WeChat's bottom bar offers 「前往小程序」.
    showToast('请前往小程序使用完整服务');
    return false;
  }
  const before = current().status;
  if (before !== 'signed-in' && before !== 'phone-required') await startSession();
  if (current().status === 'signed-in') return true;
  await navigate({
    route: 'login',
    params: redirect ? { redirect: JSON.stringify(redirect) } : {},
  });
  return false;
}

/**
 * Sign out (auth.md「退出」): revoke the token on the server, forget it here. `everywhere`
 * revokes every device's session. A server failure still signs out locally.
 */
export async function logout({ everywhere = false }: { everywhere?: boolean } = {}): Promise<void> {
  if (current().status === 'signed-in') {
    try {
      if (everywhere) await api.call('auth.logoutEverywhere');
      else await api.call('auth.logout');
    } catch {
      // The token may already be dead; signing out locally is what the shopper asked for.
    }
  }
  storage.remove(TOKEN_KEY);
  set({ status: 'signed-out' });
}
