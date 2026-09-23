import { defineRoute } from '../_conventions/route';
import { miniCodeQuery, miniCodeResult } from './schemas';

/**
 * 小程序码, for posters and share sheets.
 *
 * `auth: 'user'` rather than `user-optional`: every caller in the app is a
 * signed-in shopper sharing something (a product poster, a 拼团 invite, a
 * 预售 card), the call costs a WeChat quota, and an anonymous endpoint that
 * makes an upstream request per hit is a free amplifier. A visitor who has not
 * signed in sees the share button after the sign-in sheet, which is what the
 * legacy app did anyway.
 *
 * The answer is a URL on the shop's own storage, not WeChat's bytes: the pair
 * `(page, scene)` produces an identical PNG for ever, so it is generated once
 * and cached in `wechat_mini_codes`. The second shopper to share the same
 * product costs nothing.
 */
export const wechatMiniCode = defineRoute({
  id: 'wechat.miniCode',
  method: 'GET',
  path: '/api/v1/wechat/mini-qrcodes',
  auth: 'user',
  summary: '获取小程序码',
  tags: ['wechat'],
  query: miniCodeQuery,
  response: miniCodeResult,
  // RATE_LIMITED: more than 30 *new* codes in an hour for one account
  // (CR-11-k2); a code somebody already generated is always free.
  errors: ['AUTH_WECHAT_NOT_CONFIGURED', 'WECHAT_MINI_CODE_FAILED', 'RATE_LIMITED'],
  examples: [
    {
      name: 'product-poster',
      query: { page: 'pages/goods_details/index', scene: 'id=1024' },
      response: { url: '/uploads/wechat-mini-code/2026/09/4f1c8a2d7e6b5039.png' },
    },
    {
      name: 'groupbuy-invite',
      query: { page: 'pages/activity/goods_combination_details/index', scene: 'pid=88' },
      response: { url: '/uploads/wechat-mini-code/2026/09/9b3e5d7a1c8f2604.png' },
    },
  ],
});
