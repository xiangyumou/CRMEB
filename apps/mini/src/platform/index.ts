/**
 * The only place that calls platform APIs (`Taro.*` beyond hooks and components). Pages and
 * components import from here.
 *
 * `./runtime` is the WeChat capabilities, one implementation per build (see `types.ts`): the
 * import must stay relative, because Taro's per-platform file resolution (`runtime.h5.tsx` on
 * H5) only applies to relative requests.
 */
export { onAppVisibility } from './lifecycle';
export { openPage, replacePage, toast } from './navigation';
export { onNetworkReachability } from './network';
export { platform } from './runtime';
export { storage } from './storage';
export { applyCartBadge, applyTabBarTheme, type TabBarTheme } from './tab-bar';
export { TAB_PAGES, tabIndex, type TabKey } from './tab-pages';
export {
  PlatformUnsupportedError,
  type JsapiPayParams,
  type MiniPlatform,
  type PaymentOutcome,
  type PaymentRequest,
  type PhoneCodeResult,
} from './types';
