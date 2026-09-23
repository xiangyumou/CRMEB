import userCenterDefault from './user-center.default.json' with { type: 'json' };
import type { DiyPageValue } from './schema/page';

/**
 * 个人中心 — the built-in personal-centre page.
 *
 * `pages/user/index.vue` draws everything between the status bar and the tab
 * bar through `PageDesign`. A shop that never published a `user_center` page
 * must still get a working 我的 tab, so `GET /api/v1/diy/pages/user-center`
 * answers this when none is published, exactly as 商品详情 answers
 * `PRODUCT_DETAIL_DEFAULT_VALUE`.
 *
 * **What it holds.** Four components, top to bottom:
 *
 * - `member` (会员中心, rendered by `homeUserInfor.vue`): avatar and nickname
 *   (请点击登录 before login), the 设置 / 消息 icons, and the 优惠券 / 收藏商品 /
 *   浏览记录 counts. It is the editor's factory default with the theme's
 *   header colours. The entries the other header styles offer point at pages
 *   this shop has; the factory's 积分 / 余额 / 会员 entries are replaced.
 * - `titles` 订单中心, whose 更多 opens the order list.
 * - `menus`, the order-status row: 待付款 / 待发货 / 待收货 / 待评价 / 售后, each
 *   opening the order list on that status or the after-sales list.
 * - `menus`, 我的服务: 地址管理, 我的收藏, 优惠券, 领券中心, 浏览记录, 消息中心,
 *   个人资料 and 售后退款.
 *
 * Every link is a page in the uni-app's `pages.json`. The uni-app test
 * `mappers.misc.test.mjs` holds the contract example, which is this page, to
 * that. There is no 联系客服 entry: the storefront's 客服 is the shop's QR code,
 * and a shop that has not set one would get an entry that does nothing.
 *
 * **Why the payload is a JSON file.** It is a saved page, not code, like
 * `product-detail.default.json`.
 *
 * It must parse as a saved page does: `user-center.default.test.ts` holds it
 * to `parseDiyPageValue`, and core's `diy.test.ts` to `cleanDiyData` being a
 * no-op on it.
 */
export const USER_CENTER_DEFAULT_VALUE: DiyPageValue = userCenterDefault as DiyPageValue;

/**
 * The `version` the default answers with. It is constant, so the `ETag` stays
 * stable until an operator publishes a page of their own. That publish changes
 * it, because a saved page's version is its timestamp.
 */
export const USER_CENTER_DEFAULT_VERSION = 'builtin-user-center-1';
