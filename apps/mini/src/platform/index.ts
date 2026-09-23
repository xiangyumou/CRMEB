/**
 * The only place that calls platform APIs (`Taro.*` beyond hooks and components). Pages and
 * components import from here, so the H5 "simulated mini-program" mode and the tests can swap
 * the implementation in one place.
 */
export { onAppVisibility } from './lifecycle';
export { openPage } from './navigation';
export { onNetworkReachability } from './network';
export { applyCartBadge, applyTabBarTheme, type TabBarTheme } from './tab-bar';
export { TAB_PAGES, tabIndex, type TabKey } from './tab-pages';
