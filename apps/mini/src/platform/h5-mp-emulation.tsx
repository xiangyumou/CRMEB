import { Button } from '@tarojs/components';
import { fetchTransport } from '@shop/api-client';
import {
  PlatformUnsupportedError,
  type MiniPlatform,
  type PaymentOutcome,
  type PhoneNumberButtonProps,
} from './types';

/**
 * "模拟小程序" (plan §1): the H5 build behaving, towards the server, exactly like the
 * mini-program. Built only by `build:h5:mp-emulation`, served only by the e2e harness
 * (`e2e/storefront`, `SHOP_E2E_CLIENT=mini`); never part of the WeChat package.
 *
 * - Every request says `X-Client-Platform: wechat-mini`.
 * - `login()` returns a real, single-use `wx.login` code: the harness mints one, teaches it to
 *   the fake `api.weixin.qq.com` (`@shop/testing`'s `startFakeOaServer`) and hands it back, so
 *   the server redeems it through the same `jscode2session` call as in production.
 * - The phone button does the same for `getPhoneNumber` (`getuserphonenumber`).
 * - `requestPayment` asks the harness to settle the transaction on the fake WeChat Pay gateway
 *   and deliver the signed notification to `/api/v1/webhooks/wechat-pay`, which is what WeChat
 *   does after a real payment sheet; the page then polls `payment.status` as it would on a phone.
 *
 * Which WeChat user is "holding the phone" is test data: the harness writes it to
 * `localStorage[EMULATION_STORAGE_KEY]` before the app starts. Without one, a random user is
 * made up and kept, so a developer can click through by hand.
 *
 * The harness endpoints live under `/__e2e/mini/` on the page's own origin (the e2e edge
 * forwards them to `e2e/storefront/src/gateway-control.ts`). `scripts/size-report.mjs` fails
 * the WeChat build if that prefix or this file's storage key ever appears in it.
 */

export const EMULATION_STORAGE_KEY = '__shop_mp_emulation__';
const CONTROL_PREFIX = '/__e2e/mini';

export interface EmulatedWechatUser {
  openid: string;
  unionid?: string | undefined;
  /** What `getPhoneNumber` answers: the number without country code. */
  phone: string;
  /** What the shopper does with the payment sheet. Default `pay`. */
  payment?: 'pay' | 'cancel' | 'fail' | undefined;
}

function randomDigits(length: number): string {
  let digits = '';
  while (digits.length < length) digits += Math.floor(Math.random() * 10).toString();
  return digits;
}

/** The WeChat user on this "phone": what the harness set up, or a made-up one, kept. */
export function emulatedUser(): EmulatedWechatUser {
  const raw = window.localStorage.getItem(EMULATION_STORAGE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw) as Partial<EmulatedWechatUser>;
    if (typeof parsed.openid === 'string' && typeof parsed.phone === 'string') {
      return parsed as EmulatedWechatUser;
    }
  }
  const made: EmulatedWechatUser = {
    openid: `o_emu_${randomDigits(16)}`,
    phone: `139${randomDigits(8)}`,
  };
  window.localStorage.setItem(EMULATION_STORAGE_KEY, JSON.stringify(made));
  return made;
}

async function control<T>(action: string, body: unknown): Promise<T> {
  const response = await fetch(`${CONTROL_PREFIX}/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`模拟小程序：${action} 失败 (${response.status} ${await response.text()})`);
  }
  return (await response.json()) as T;
}

function PhoneNumberButton({ children, className, disabled, onResult }: PhoneNumberButtonProps) {
  return (
    <Button
      className={className ?? ''}
      disabled={disabled ?? false}
      onClick={() => {
        const user = emulatedUser();
        control<{ code: string }>('phone-code', { phone: user.phone }).then(
          ({ code }) => onResult({ ok: true, code }),
          (error: unknown) =>
            onResult({
              ok: false,
              reason: 'failed',
              message: error instanceof Error ? error.message : String(error),
            }),
        );
      }}
    >
      {children}
    </Button>
  );
}

export const emulationPlatform: MiniPlatform = {
  kind: 'h5-mp-emulation',
  api: { baseUrl: '', transport: fetchTransport(), clientPlatform: 'wechat-mini' },
  async login() {
    const user = emulatedUser();
    const { code } = await control<{ code: string }>('login-code', {
      openid: user.openid,
      unionid: user.unionid,
    });
    return code;
  },
  PhoneNumberButton,
  async requestPayment({ params }): Promise<PaymentOutcome> {
    const behaviour = emulatedUser().payment ?? 'pay';
    if (behaviour === 'cancel') return { kind: 'cancelled' };
    if (behaviour === 'fail') return { kind: 'failed', message: 'requestPayment:fail (模拟)' };
    // Only the package, as on a phone: the harness finds the order by prepay_id.
    await control('request-payment', { package: params.package });
    return { kind: 'paid' };
  },
  requestSubscribe() {
    // TODO(stream A / I2): answer from the emulated user's settings, all `accept` by default.
    return Promise.reject(new PlatformUnsupportedError('订阅消息', 'h5-mp-emulation'));
  },
  chooseAddress() {
    // TODO(stream A / I2): answer from the emulated user's settings.
    return Promise.reject(new PlatformUnsupportedError('导入微信地址', 'h5-mp-emulation'));
  },
};
