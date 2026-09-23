import Taro from '@tarojs/taro';
import { Button } from '@tarojs/components';
import { taroTransport } from '@shop/api-client';
import type {
  AvatarButtonProps,
  ChosenAddress,
  MiniPlatform,
  PaymentOutcome,
  PhoneNumberButtonProps,
  SubscribeResult,
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
        const { code, errMsg: message } = event.detail as { code?: string; errMsg: string };
        const errno = (event.detail as { errno?: number }).errno;
        if (code) onResult({ ok: true, code });
        else if (errno === 1400001 || /1400001/.test(message))
          onResult({
            ok: false,
            reason: 'unavailable',
            message: '暂时无法获取手机号，请使用短信验证码登录',
          });
        else if (/deny|cancel/i.test(message))
          onResult({ ok: false, reason: 'denied', message: '已取消授权' });
        else onResult({ ok: false, reason: 'failed', message });
      }}
    >
      {children}
    </Button>
  );
}

function AvatarButton({ children, className, label, onResult }: AvatarButtonProps) {
  return (
    <Button
      className={className ?? ''}
      openType="chooseAvatar"
      {...(label ? { ariaLabel: label } : {})}
      onChooseAvatar={(event) => {
        const { avatarUrl, errMsg: message } = event.detail as {
          avatarUrl?: string;
          errMsg?: string;
        };
        if (avatarUrl) onResult({ ok: true, tempPath: avatarUrl });
        else onResult({ ok: false, message: message ?? '没有选择头像' });
      }}
    >
      {children}
    </Button>
  );
}

const SUBSCRIBE_ANSWERS = new Set(['accept', 'reject', 'ban', 'filter']);

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
  async requestSubscribe(templateIds) {
    // `entityIds` is required by Taro's types for other platforms; WeChat ignores it.
    const result = (await Taro.requestSubscribeMessage({
      tmplIds: templateIds,
      entityIds: [],
    })) as unknown as Record<string, string>;
    const answers: SubscribeResult = {};
    for (const id of templateIds) {
      const answer = result[id];
      if (answer && SUBSCRIBE_ANSWERS.has(answer)) answers[id] = answer as SubscribeResult[string];
    }
    return answers;
  },
  async chooseAddress(): Promise<ChosenAddress | null> {
    try {
      const address = await Taro.chooseAddress();
      return {
        name: address.userName,
        phone: address.telNumber,
        province: address.provinceName,
        city: address.cityName,
        district: address.countyName,
        detail: address.detailInfo,
        postCode: address.postalCode || null,
      };
    } catch {
      // Cancelled, or refused (privacy / 通讯地址 permission): the caller offers manual entry.
      return null;
    }
  },
  AvatarButton,
  async chooseImages(count) {
    try {
      const result = await Taro.chooseMedia({
        count,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed'],
      });
      return result.tempFiles.map((file) => file.tempFilePath);
    } catch (error) {
      if (isCancel(error)) return [];
      throw new Error(errMsg(error), { cause: error });
    }
  },
  async uploadFile({ url, filePath, name, headers }) {
    const base = process.env.TARO_APP_API_ORIGIN;
    const result = await Taro.uploadFile({
      url: /^https?:/.test(url) ? url : `${base}${url}`,
      filePath,
      name,
      header: headers,
    });
    return { status: result.statusCode, body: typeof result.data === 'string' ? result.data : '' };
  },
};
