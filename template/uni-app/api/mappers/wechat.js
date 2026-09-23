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
export function toPageJssdkConfig(dto) {
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
export function toPageSubscribeTemplates(dto) {
  return list(dto && dto.templateIds)
    .map((id) => text(id))
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// 小程序码 (GET /api/v1/wechat/mini-qrcodes)
// ---------------------------------------------------------------------------

/** 路由只收这四个 `page`；页面的三种用途各对应一个。 */
export const MINI_CODE_PAGES = {
  product: 'pages/goods_details/index',
  groupbuy: 'pages/activity/goods_combination_details/index',
  presell: 'pages/activity/presell_details/index',
  home: 'pages/index/index',
};

/** WeChat 的 scene 上限是 32 字节，路由按 32 个 ASCII 字符校验。 */
const SCENE_MAX = 32;

/**
 * 页面的「给我这个商品 / 这个拼团 / 我自己的推广码」→ `{page, scene}`。
 *
 * scene 的写法照目标页 `onLoad` 里 `getUrlParams(decodeURIComponent(options.scene))`
 * 读的键：商品详情和拼团详情读 `id` 和推广人 `pid`，首页读 `spid`。没登录（uid 为 0）
 * 就不带推广人；id 长到装不下推广人时也只丢推广人，保住页面能打开。
 */
export function fromPageMiniCodeQuery(kind, id, uid) {
  const page = MINI_CODE_PAGES[kind] || MINI_CODE_PAGES.home;
  const spreader = /^[1-9]\d*$/.test(text(uid)) ? text(uid) : '';
  if (page === MINI_CODE_PAGES.home) {
    return { page, scene: spreader ? `spid=${spreader}` : 'home' };
  }
  const base = `id=${text(id).trim()}`;
  const withSpreader = spreader ? `${base}&pid=${spreader}` : base;
  return { page, scene: withSpreader.length <= SCENE_MAX ? withSpreader : base };
}

/**
 * `{url}` → 页面读的两种名字：海报 mixin 和两个详情页读 `res.data.code`，
 * poster-poster 读 `res.data.url`。
 */
export function toPageMiniCode(dto) {
  const url = text(dto && dto.url);
  return { code: url, url };
}
