import Taro from '@tarojs/taro';
import { Button } from '@tarojs/components';
import { taroTransport } from '@shop/api-client';
import {
  PlatformUnsupportedError,
  type MiniPlatform,
  type PaymentOutcome,
  type PhoneNumberButtonProps,
} from './types';

/**
 * The WeChat mini-program: the real `wx.*` APIs through Taro. This is the default module for
 * `./runtime`; an H5 build resolves `runtime.h5.tsx` instead (see `types.ts`).
 */

/** `requestPayment:fail cancel` is the shopper closing the sheet, not an error. */
function isCancel(error: unknown): boolean {
  const message = (error as { errMsg?: unknown } | null)?.errMsg;
  return typeof message === 'string' && /cancel/i.test(message);
}

function errMsg(error: unknown): string {
  const message = (error as { errMsg?: unknown } | null)?.errMsg;
  return typeof message === 'string' ? message : String(error);
}

function PhoneNumberButton({ children, className, disabled, onResult }: PhoneNumberButtonProps) {
  return (
    <Button
      className={className ?? ''}
      disabled={disabled ?? false}
      openType="getPhoneNumber"
      onGetPhoneNumber={(event) => {
        const { code, errMsg: message } = event.detail;
        if (code) onResult({ ok: true, code });
        else if (/deny|cancel/i.test(message))
          onResult({ ok: false, reason: 'denied', message: '已取消授权' });
        else onResult({ ok: false, reason: 'failed', message });
      }}
    >
      {children}
    </Button>
  );
}

export const platform: MiniPlatform = {
  kind: 'weapp',
  api: {
    // The shop's https origin; it must also be a 服务器域名 (request 合法域名) in the WeChat
    // console. Set it in `.env.production.local` (gitignored), see docs/mini/spikes/S4-e2e.md.
    baseUrl: process.env.TARO_APP_API_ORIGIN,
    transport: taroTransport(Taro.request),
    clientPlatform: 'wechat-mini',
  },
  async login() {
    const { code } = await Taro.login();
    if (!code) throw new Error('wx.login 没有返回 code');
    return code;
  },
  PhoneNumberButton,
  async requestPayment({ params }): Promise<PaymentOutcome> {
    try {
      await Taro.requestPayment({
        timeStamp: params.timeStamp,
        nonceStr: params.nonceStr,
        package: params.package,
        signType: params.signType,
        paySign: params.paySign,
      });
      return { kind: 'paid' };
    } catch (error) {
      if (isCancel(error)) return { kind: 'cancelled' };
      return { kind: 'failed', message: errMsg(error) };
    }
  },
  requestSubscribe() {
    // TODO(stream A): Taro.requestSubscribeMessage, mapped to SubscribeResult.
    return Promise.reject(new PlatformUnsupportedError('订阅消息', 'weapp'));
  },
  chooseAddress() {
    // TODO(stream A): Taro.chooseAddress behind the privacy sheet (C03).
    return Promise.reject(new PlatformUnsupportedError('导入微信地址', 'weapp'));
  },
};
