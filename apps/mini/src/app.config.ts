import { MAIN_PAGES, PRELOAD_RULES, SUB_PACKAGES } from './app.pages';
import { TAB_PAGES } from './platform/tab-pages';

/**
 * The app manifest (`app.json`). Pages and packages come from `app.pages.ts`
 * (docs/mini/pages.md): main ≤ 1.5 MB, each sub-package ≤ 1 MB, total ≤ 8 MB.
 *
 * `TARO_APP_RELEASE=1` (the upload build) leaves out the dev-only demo package.
 */
const release = process.env.TARO_APP_RELEASE === '1';

export default defineAppConfig({
  pages: [...MAIN_PAGES],
  subPackages: SUB_PACKAGES.filter((pkg) => !(release && pkg.devOnly)).map((pkg) => ({
    root: pkg.root,
    name: pkg.name,
    pages: [...pkg.pages],
  })),
  preloadRule: Object.fromEntries(
    Object.entries(PRELOAD_RULES).map(([page, packages]) => [
      page,
      { network: 'all' as const, packages: [...packages] },
    ]),
  ),
  window: {
    navigationBarTitleText: '商城',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTextStyle: 'black',
    backgroundColor: '#f5f5f5',
    backgroundTextStyle: 'dark',
  },
  // Native tab bar (4 fixed tabs). Labels and colours are re-applied at runtime from
  // `app/config` appearance (src/theme/native.ts); the icons are bundled PNGs. See
  // docs/mini/spikes/S1-taro.md for why not `custom: true`.
  tabBar: {
    color: '#666666',
    selectedColor: '#e1251b',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    list: TAB_PAGES.map((tab) => ({ pagePath: tab.pagePath, text: tab.text })),
  },
  // Inject only the components a page actually uses (smaller, faster start).
  lazyCodeLoading: 'requiredComponents',
  // Privacy (C04): every private API we call must be declared here, and the privacy guide on
  // the WeChat platform must match `src/platform/privacy.ts` PRIVACY_APIS.
  __usePrivacyCheck__: true,
  requiredPrivateInfos: ['chooseAddress'],
});
