import type { ComponentType, ReactNode } from 'react';
import type { ClientPlatform, ResponseOf, Transport } from '@shop/api-client';

/**
 * The WeChat capabilities the storefront needs, as one interface with one implementation per
 * build (plan §1, "平台能力"). Pages and features call these; only `src/platform/` calls `Taro.*`.
 *
 * Which implementation a build gets is decided by the bundler, not at run time, so the WeChat
 * package never contains the H5 ones (`scripts/size-report.mjs` scans for them):
 *
 * | Build                                   | Module                  | Implementation                  |
 * | --------------------------------------- | ----------------------- | ------------------------------- |
 * | `build:weapp` (the product)             | `runtime.tsx`           | `Taro.login`, `requestPayment`… |
 * | `build:h5`                              | `runtime.h5.tsx`        | `h5-preview.tsx`: no WeChat     |
 * | `build:h5:mp-emulation` (the e2e suite) | `runtime.h5.tsx`        | `h5-mp-emulation.tsx`           |
 *
 * `runtime.h5.tsx` is picked over `runtime.tsx` by Taro's multi-platform resolution
 * (`MultiPlatformPlugin`, relative imports only) whenever `TARO_ENV` is `h5`, and the mp
 * flavour by `TARO_APP_PLATFORM_EMULATION=mp`, which `config/index.ts` refuses for weapp.
 */

/** What `payment.start` hands the client for `wx.requestPayment`. */
export type JsapiPayParams = NonNullable<ResponseOf<'payment.start'>['jsapi']>;

export interface PaymentRequest {
  /**
   * The merchant order number, from the same `payment.start` answer. `wx.requestPayment` does
   * not need it; the emulation does, to tell the fake gateway which transaction to settle (the
   * fake does not map `prepay_id` back to an order).
   */
  outTradeNo: string;
  params: JsapiPayParams;
}

/**
 * How `requestPayment` ended, as the client sees it. `paid` only means WeChat's sheet said so:
 * the order is paid when `payment.status` says so, which is why every outcome but `cancelled`
 * goes on to the result page and polls (C06).
 */
export type PaymentOutcome =
  { kind: 'paid' } | { kind: 'cancelled' } | { kind: 'failed'; message: string };

/** What a tap on the phone-number button produced. */
export type PhoneCodeResult =
  { ok: true; code: string } | { ok: false; reason: 'denied' | 'failed'; message: string };

export interface PhoneNumberButtonProps {
  children: ReactNode;
  className?: string | undefined;
  disabled?: boolean | undefined;
  onResult: (result: PhoneCodeResult) => void;
}

export interface SubscribeResult {
  /** Template id → what the shopper chose. */
  [templateId: string]: 'accept' | 'reject' | 'ban' | 'filter';
}

export interface ChosenAddress {
  name: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
  postCode: string | null;
}

export interface MiniPlatform {
  /** Which implementation this build carries; shown nowhere, useful in a bug report. */
  readonly kind: 'weapp' | 'h5-preview' | 'h5-mp-emulation';
  /** How `@shop/api-client` talks to `/api/v1` in this build. */
  readonly api: {
    /** `''` for same-origin (H5), the shop's https origin in the mini-program. */
    baseUrl: string;
    transport: Transport;
    /** Sent as `X-Client-Platform`; the server picks the WeChat app and pay channel by it. */
    clientPlatform: ClientPlatform;
  };
  /** `wx.login()`: a single-use code for `POST /auth/sessions/wechat-mini`. */
  login(): Promise<string>;
  /**
   * `<button open-type="getPhoneNumber">`. A component, not a function, because WeChat only
   * hands out a phone code from a tap on its own button.
   */
  PhoneNumberButton: ComponentType<PhoneNumberButtonProps>;
  /** `wx.requestPayment()` with the parameters `payment.start` returned. */
  requestPayment(request: PaymentRequest): Promise<PaymentOutcome>;
  /**
   * `wx.requestSubscribeMessage()` before 提交订单 (C08).
   * TODO(stream A): implement for weapp and emulation; this spike does not need it.
   */
  requestSubscribe(templateIds: string[]): Promise<SubscribeResult>;
  /**
   * `wx.chooseAddress()` (导入微信地址), behind the privacy check (C03).
   * TODO(stream A): implement for weapp and emulation; this spike seeds the address instead.
   */
  chooseAddress(): Promise<ChosenAddress | null>;
}

/** Thrown by a capability this build does not have (H5 preview) or does not have yet (TODO). */
export class PlatformUnsupportedError extends Error {
  constructor(capability: string, build: MiniPlatform['kind']) {
    super(`${build} 不支持 ${capability}`);
    this.name = 'PlatformUnsupportedError';
  }
}
