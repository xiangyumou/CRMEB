// payment DTOs → the legacy 支付 view models.
//
// Contract: next/packages/contracts/src/payment/payment.storefront.contract.ts
//
// `pages/goods/cashier` and `components/payment` switch on `res.data.status`
// (`SUCCESS` | `WECHAT_PAY` | `PAY_ERROR`) and hand `res.data.result.jsConfig`
// to `utils/wechatPayment.js`. Only WeChat Pay survives the rewrite.

import { toId, money, text, unixSeconds } from './_shared.js';

/** `X-Client-Platform` → the channel `POST /api/v1/orders/:id/payments` expects. */
export function paymentChannelFor(platform) {
  if (platform === 'wechat-mini') return 'wechat_mini';
  if (platform === 'wechat-oa') return 'wechat_oa';
  return 'wechat_h5';
}

/**
 * `paymentStart` → `{status, result: {jsConfig}}`.
 *
 * `jsConfig` carries both `timestamp` and `timeStamp`: the mini-program helper reads the
 * lower-case one, `jweixin`'s `chooseWXPay` reads the camel-case one, and the old payload
 * happened to satisfy both.
 */
export function toLegacyPayResult(dto) {
  if (!dto) return { status: 'PAY_ERROR', result: { jsConfig: {} } };
  const jsapi = dto.jsapi || {};
  const jsConfig = {
    appId: text(jsapi.appId),
    timestamp: text(jsapi.timeStamp),
    timeStamp: text(jsapi.timeStamp),
    nonceStr: text(jsapi.nonceStr),
    package: text(jsapi.package),
    signType: text(jsapi.signType, 'RSA'),
    paySign: text(jsapi.paySign),
    h5_url: text(dto.h5Url),
  };
  return {
    status: dto.alreadyPaid ? 'SUCCESS' : 'WECHAT_PAY',
    result: {
      jsConfig,
      orderId: text(dto.orderId),
      out_trade_no: text(dto.outTradeNo),
      attempt_id: text(dto.attemptId),
      pay_price: money(dto.amount),
      expires_at: unixSeconds(dto.expiresAt, 0),
    },
    // `pay_type` used to decide the toast; the only channel left is WeChat.
    pay_type: 'weixin',
  };
}

/** The toast title the cashier shows for each branch. */
export function payResultMessage(dto) {
  if (!dto) return '支付失败';
  return dto.alreadyPaid ? '支付成功' : '订单创建成功';
}

/** `GET /api/v1/payments/:outTradeNo` → the 支付结果 poll. */
export function toLegacyPayStatus(dto) {
  if (!dto) return { status: 0, paid: 0 };
  return {
    out_trade_no: text(dto.outTradeNo),
    order_id: text(dto.orderId),
    oid: toId(dto.orderId),
    paid: dto.paid ? 1 : 0,
    status: dto.paid ? 1 : 0,
    pay_time: unixSeconds(dto.paidAt, 0),
    _status: text(dto.status),
  };
}
