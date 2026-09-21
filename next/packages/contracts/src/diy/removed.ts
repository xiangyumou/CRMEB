/**
 * What this build of the storefront no longer ships.
 *
 * Two lists, copied verbatim from the PHP so a diff against the old code is a
 * plain string comparison:
 *
 * - `REMOVED_DIY_COMPONENTS` — `CoreStore::REMOVED_COMPONENTS`
 *   (`crmeb/app/services/CoreStore.php:10`).
 * - `REMOVED_STOREFRONT_PAGES` — `crmeb/config/core_store_removed_pages.json`.
 *
 * Both are about *old data*, not about what an operator can create: a page
 * decorated before 拼团/秒杀/积分商城 were dropped still has those components and
 * those links in its saved JSON, and the renderer would either show a dead tile
 * or navigate into a 404. The rows are never rewritten — the storefront read
 * filters them out — so re-enabling a feature is a code change, not a data
 * migration. See `cleanDiyData` in `@shop/core/diy`.
 */

export const REMOVED_DIY_COMPONENTS: readonly string[] = [
  'bargain',
  'seckill',
  'pointsMall',
  'signIn',
  'liveBroadcast',
  'homePaidVip',
  'home_bargain',
  'home_seckill',
  'home_paid_vip',
  'points_mall',
  'sign_in',
  'wechat_live',
];

export const REMOVED_STOREFRONT_PAGES: readonly string[] = [
  'kefu/mobile_list',
  'pages/activity/bargain/index',
  'pages/activity/goods_bargain/index',
  'pages/activity/goods_seckill/index',
  'pages/admin/distribution/index',
  'pages/admin/distribution/orderDetail/index',
  'pages/admin/distribution/scanning/detail/index',
  'pages/admin/distribution/scanning/index',
  'pages/admin/manage/index',
  'pages/admin/order_cancellation/index',
  'pages/annex/offline_pay/index',
  'pages/annex/offline_result/index',
  'pages/annex/vip_active/index',
  'pages/annex/vip_clause/index',
  'pages/annex/vip_coupon/index',
  'pages/annex/vip_paid/index',
  'pages/columnGoods/live_list/index',
  'pages/extension/customer_list/chat',
  'pages/goods/goods_comment_con/lottery_comment',
  'pages/goods/goods_details_store/index',
  'pages/goods/lottery/grids/index',
  'pages/goods/lottery/grids/record',
  'pages/points_mall/exchange_record',
  'pages/points_mall/index',
  'pages/points_mall/integral_goods_details',
  'pages/points_mall/integral_goods_list',
  'pages/points_mall/integral_order',
  'pages/points_mall/integral_order_details',
  'pages/points_mall/integral_order_status',
  'pages/points_mall/logistics_details',
  'pages/points_mall/user_address',
  'pages/users/alipay_invoke/index',
  'pages/users/commission_rank/index',
  'pages/users/promoter-list/index',
  'pages/users/promoter-order/index',
  'pages/users/promoter_rank/index',
  'pages/users/staff_list/index',
  'pages/users/user_bill/index',
  'pages/users/user_cash/index',
  'pages/users/user_distribution_level/index',
  'pages/users/user_integral/index',
  'pages/users/user_money/index',
  'pages/users/user_payment/index',
  'pages/users/user_sgin/index',
  'pages/users/user_sgin_list/index',
  'pages/users/user_spread_code/index',
  'pages/users/user_spread_money/index',
  'pages/users/user_spread_money/receiving',
  'pages/users/user_spread_user/index',
  'pages/users/user_vip/index',
  'pages/users/user_vip_areer/index',
];

const removedComponents = new Set(REMOVED_DIY_COMPONENTS);
const removedPages = new Set(REMOVED_STOREFRONT_PAGES);

export function isRemovedDiyComponent(name: unknown): boolean {
  return typeof name === 'string' && removedComponents.has(name);
}

/**
 * The path part of a navigation target, as the PHP compares it:
 * `ltrim(explode('?', $url)[0], '/')`. Anything after `?` and any number of
 * leading slashes are irrelevant.
 */
export function normaliseStorefrontPath(url: string): string {
  return url.split('?')[0]!.replace(/^\/+/, '');
}

/**
 * Whether a navigation target points at a page that is no longer shipped.
 *
 * Mirrors `DiyCompatibilityServices::isRemovedPage`, including the escape
 * hatch: anything starting with `http` is an external link and is left alone.
 * (`clean()` omits that check because a URL with a scheme can never equal a
 * bare `pages/...` entry anyway.)
 */
export function isRemovedStorefrontPage(url: unknown): boolean {
  if (typeof url !== 'string' || url === '') return false;
  if (url.startsWith('http')) return false;
  return removedPages.has(normaliseStorefrontPath(url));
}
