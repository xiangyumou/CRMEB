import { z } from 'zod';
import { id } from '../_conventions/common';
import {
  storefrontRouteDef,
  storefrontRouteKeys,
  type StorefrontMiniCodeKey,
} from '../system/storefront-routes';

/**
 * Shapes for the mini-program WeChat routes.
 *
 * The Official Account's own shapes are in `wechat-oa/schemas.ts`; nothing is
 * shared between the two but the vendor's name.
 */

/**
 * Where a 小程序码 may point.
 *
 * An allow-list, and a short one, because `page` is a parameter the storefront
 * sends and the server hands to WeChat. Without it the endpoint generates a
 * code for any path in the mini program on request — including pages a shop
 * never links to — and, worse, turns the shop into somebody else's poster
 * factory: the codes are cached and served from the shop's own storage.
 *
 * The paths are the mini-program's, not the H5 site's, and they are exactly as
 * `pages.json` spells them (`apps/uni-app`). A page that is not in the
 * published version answers `WECHAT_MINI_CODE_FAILED` from WeChat rather than
 * silently producing a code that opens the home screen.
 *
 * Adding one is a contract change on purpose: it is the review step.
 */
export const MINI_CODE_PAGES = [
  'pages/index/index',
  'pages/goods_details/index',
  'pages/activity/goods_combination_details/index',
  'pages/activity/presell_details/index',
] as const;

export const miniCodePage = z.enum(MINI_CODE_PAGES);
export type MiniCodePage = z.infer<typeof miniCodePage>;

/**
 * `scene` is WeChat's own 32-**byte** parameter, and it is the only thing the
 * opened page receives.
 *
 * The byte limit is checked in the domain, where the encoding is known: a
 * 32-character limit here would let `id=一二三四…` through and fail at WeChat
 * with a number nobody can read. The character class is narrowed to what
 * WeChat documents as safe — it refuses several ASCII punctuation marks — so a
 * scene that cannot work is refused before it costs a call.
 */
export const miniCodeScene = z
  .string()
  .min(1)
  .max(32)
  .regex(/^[0-9a-zA-Z!#$&'()*+,/:;=?@\-._~]+$/, 'scene 含有微信不接受的字符');

export const miniCodeQuery = z.object({
  page: miniCodePage,
  scene: miniCodeScene,
});
export type MiniCodeQuery = z.infer<typeof miniCodeQuery>;

export const miniCodeResult = z.object({
  /** Public URL of the PNG. Site-relative on the local storage driver. */
  url: z.string(),
});
export type MiniCodeResult = z.infer<typeof miniCodeResult>;

// ---------------------------------------------------------------------------
// 小程序码 from the route catalogue
// ---------------------------------------------------------------------------

/** The catalogue keys marked `miniCode` — the only pages a share code opens. */
export const SHARE_MINI_CODE_ROUTES = storefrontRouteKeys.filter(
  (key) => storefrontRouteDef(key).miniCode === true,
) as [StorefrontMiniCodeKey, ...StorefrontMiniCodeKey[]];

export const shareMiniCodeRoute = z.enum(SHARE_MINI_CODE_ROUTES);

/**
 * `?route=product&id=1024`: a catalogue key and that route's params, flat.
 *
 * Every `miniCode` key takes one `id` or nothing, so `id` is the only param
 * the query knows today; a key that needs another adds it here. Whether the
 * params fit the key is the domain's check (`storefrontRoute` is strict), so
 * `?route=home&id=1` is a `VALIDATION_FAILED`, not a code that ignores `id`.
 */
export const shareMiniCodeQuery = z.object({
  route: shareMiniCodeRoute,
  id: id.optional(),
});
export type ShareMiniCodeQuery = z.infer<typeof shareMiniCodeQuery>;
