// 微信 DTOs → what `libs/wechat.js` and the 订阅消息 helpers read.
//
// Contract: next/packages/contracts/src/wechat/wechat.storefront.contract.ts

import { text, list } from './_shared.js';

/**
 * `jssdkConfig` → `wx.config()`'s argument.
 *
 * `libs/wechat.js` spreads this straight into `wx.config`, which wants `appId`,
 * `timestamp`, `nonceStr` and `signature` under exactly those names — and a
 * `timestamp` that is a string, because that is what the signature was computed over.
 */
export function toLegacyJssdkConfig(dto) {
  if (!dto) return {};
  return {
    appId: text(dto.appId),
    timestamp: text(dto.timestamp),
    nonceStr: text(dto.nonceStr),
    signature: text(dto.signature),
  };
}

/**
 * `subscribeTemplates` → the bare array of ids `uni.requestSubscribeMessage` is handed.
 *
 * An empty array is a normal answer, not an error: a shop that configured no templates
 * simply skips the prompt, which is why `utils/SubscribeMessage.js` resolves without
 * asking rather than calling `requestSubscribeMessage` with `tmplIds: []` (it throws).
 */
export function toLegacySubscribeTemplates(dto) {
  return list(dto && dto.templateIds)
    .map((id) => text(id))
    .filter(Boolean);
}
