/**
 * The four tab pages, in tab-bar order. `app.config.ts` builds `pages` and `tabBar.list` from
 * this, and the tab-bar sync uses the index to address a tab (setTabBarBadge takes an index).
 *
 * This file is read by the Taro config compiler as well as bundled, so it must stay free of
 * runtime imports.
 */
export const TAB_PAGES = [
  { key: 'home', pagePath: 'pages/home/index', text: '首页' },
  { key: 'category', pagePath: 'pages/category/index', text: '分类' },
  { key: 'cart', pagePath: 'pages/cart/index', text: '购物车' },
  { key: 'me', pagePath: 'pages/me/index', text: '我的' },
] as const;

export type TabKey = (typeof TAB_PAGES)[number]['key'];

export function tabIndex(key: TabKey): number {
  return TAB_PAGES.findIndex((tab) => tab.key === key);
}
