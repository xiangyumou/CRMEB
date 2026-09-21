/**
 * The `wechat` domain's public surface.
 *
 * Two clients live here, and they are deliberately separate:
 *
 * | Client            | Host                     | Credentials                | Callers |
 * | ----------------- | ------------------------ | -------------------------- | ------- |
 * | `WechatCoreClient`| `api.weixin.qq.com`      | appid + secret (`wechat`)  | E1 (login), E2 (messages, menus, media) |
 * | `WechatPayClient` | `api.mch.weixin.qq.com`  | merchant keys (`payment`)  | C only  |
 *
 * `createWechatPayClient` takes its credentials as an argument rather than
 * reading the `payment` config group itself. A core domain may reach another
 * only through that domain's `index.ts`, and `payment` already imports
 * `wechat`; the argument keeps the arrow pointing one way. The payment domain
 * builds the object in `payment/payment.config.ts` (`paymentCredentials`).
 *
 * `wechat.crypto.ts` is exported whole because two very different things need
 * it: the pay client (v3 signing, AEAD) and — once E2 lands — the OA message
 * callback, which verifies the same kind of signature over a different body.
 */

export {
  createWechatClient,
  getWechatClient,
  resetWechatTokenFlight,
  type MiniSession,
  type OaCodeExchange,
  type SubscribeMessageInput,
  type TemplateMessageInput,
  type WechatApp,
  type WechatCall,
  type WechatCoreClient,
  type WechatProfile,
  type WechatSendResult,
} from './wechat.client';

export { wechatConfig, type WechatConfig } from './wechat.config';

/** Read-only; the writes belong to E1's login flow. */
export { findOpenid } from './wechat.repo';

export {
  createWechatPayClient,
  isPaymentConfigured,
  type GatewayRefund,
  type GatewayRefundStatus,
  type GatewayTransaction,
  type PayCreateInput,
  type RefundCreateInput,
  type VerifiedNotification,
  type WechatPayClient,
  type WechatPayCredentials,
  type WechatTradeState,
} from './wechat.pay';

export {
  AeadDecryptError,
  aeadDecrypt,
  buildAuthorization,
  buildJsapiPayParams,
  decryptResource,
  nonceStr,
  requestSignatureMessage,
  safeEqual,
  signatureMessage,
  signWithMerchantKey,
  SIGNATURE_MAX_SKEW_SECONDS,
  VERIFY_FAILURE_MESSAGE,
  verifySignedPayload,
  verifyWithPlatformKey,
  type AuthorizationInput,
  type SignatureHeaders,
  type VerifyFailure,
  type VerifyInput,
  type VerifyResult,
} from './wechat.crypto';
