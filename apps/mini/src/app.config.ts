import { TAB_PAGES } from './platform/tab-pages';

/**
 * The app manifest (`app.json`). Main package: the four tab pages only for now; everything
 * else lives in a sub-package (docs/mini: main ≤ 1.5 MB, total ≤ 8 MB).
 */
export default defineAppConfig({
  pages: [...TAB_PAGES.map((tab) => tab.pagePath), 'pages/product/index'],
  subPackages: [
    {
      // docs/mini/pages.md: checkout, cashier and the result page; stream B adds the rest.
      root: 'packages/order',
      name: 'order',
      pages: ['checkout/index', 'cashier/index', 'pay-result/index'],
    },
    {
      root: 'subpackages/demo',
      name: 'demo',
      // `pages/blocks` is spike S3's fixture page for the editor-canvas pixel comparison.
      pages: ['pages/ui/index', 'pages/blocks/index'],
    },
  ],
  window: {
    navigationBarTitleText: '商城',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTextStyle: 'black',
    backgroundColor: '#f5f5f5',
    backgroundTextStyle: 'light',
  },
  // Native tab bar; colours, items and the cart badge are set at runtime from the theme
  // (src/platform/tab-bar.ts). See docs/mini/spikes/S1-taro.md for why not `custom: true`.
  tabBar: {
    color: '#666666',
    selectedColor: '#e93323',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    list: TAB_PAGES.map((tab) => ({ pagePath: tab.pagePath, text: tab.text })),
  },
  // Inject only the components a page actually uses (smaller, faster start).
  lazyCodeLoading: 'requiredComponents',
  // Privacy: every private API we call must be declared here, and the privacy guide on the
  // WeChat platform must match. `chooseAddress` is the first; stream A adds the rest.
  __usePrivacyCheck__: true,
  requiredPrivateInfos: ['chooseAddress'],
});
