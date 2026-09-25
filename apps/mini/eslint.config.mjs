import { shopConfig } from '@shop/config/eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * The mini-program's lint. The shared preset resolves typescript-eslint against its own
 * TypeScript 6 (docs/conventions.md, "Tooling caveats"), so no shim is needed here.
 *
 * The boundaries are what keep the main package small and the platform swappable:
 *
 * - nothing server-side (`@shop/core`, `@shop/db`, `@shop/testing`) and no zod at runtime;
 * - `@shop/contracts` for types only, except the zod-free modules listed below;
 * - `Taro.*` platform APIs only inside `src/platform/` (pages may use Taro's hooks).
 */

/** Lifecycle hooks and helpers of `@tarojs/taro` that any component may import. */
const TARO_HOOKS = [
  'useDidHide',
  'useDidShow',
  'useLaunch',
  'useLoad',
  'usePageScroll',
  'usePullDownRefresh',
  'useReachBottom',
  'useReady',
  'useResize',
  'useRouter',
  'useShareAppMessage',
  'useShareTimeline',
  'useTabItemTap',
  'useUnload',
];

/**
 * The workspace has one `@types/react` (19, shared with apps/web; see docs/mini/spikes/S1-taro.md)
 * but the mini-program runs React 18. These type-check and then fail at runtime.
 */
const REACT_19_ONLY = {
  name: 'react',
  importNames: ['use', 'useActionState', 'useOptimistic'],
  message: '小程序运行的是 React 18（Taro 4.2），没有这个 API',
};

/**
 * Browser globals a phone's mini-program runtime does not have, or has only as Taro's partial
 * stand-in (the build swaps `URLSearchParams`, `URL`, `window`, `document`… for its own, which
 * lack most of the browser API: `Object.fromEntries(new URLSearchParams(q))` threw on phones).
 * DevTools' simulator, the H5 e2e build and Node's vitest all have the real ones, so nothing
 * before a device shows the crash. apps/mini/scripts/size-report.mjs checks the build for the
 * ones Taro does not swap.
 */
const MISSING_ON_WEAPP = [
  ['URLSearchParams', 'Taro 的 URLSearchParams 不能遍历；用 src/lib/query.ts 的 parseQuery'],
  ['URL', 'Taro 的 URL 不完整；手写拼接或 @shop/api-client/url'],
  ['window', '小程序没有 window'],
  ['document', '小程序没有 document'],
  ['navigator', '小程序没有 navigator；系统信息走 src/platform'],
  ['location', '小程序没有 location；路由走 src/platform/nav.ts'],
  ['history', '小程序没有 history；路由走 src/platform/nav.ts'],
  ['localStorage', '小程序没有 localStorage；存储走 src/platform'],
  ['sessionStorage', '小程序没有 sessionStorage；存储走 src/platform'],
  ['fetch', '小程序没有 fetch；请求走 @shop/api-client'],
  ['XMLHttpRequest', '小程序没有 XMLHttpRequest；请求走 @shop/api-client'],
  ['FormData', '小程序没有 FormData；上传走 src/platform'],
  ['Blob', '小程序没有 Blob'],
  ['File', '小程序没有 File'],
  ['FileReader', '小程序没有 FileReader；文件走 src/platform'],
  ['btoa', '小程序没有 btoa'],
  ['atob', '小程序没有 atob'],
  ['TextEncoder', '小程序没有 TextEncoder'],
  ['TextDecoder', '小程序没有 TextDecoder'],
  ['structuredClone', '小程序没有 structuredClone'],
  ['requestAnimationFrame', '小程序页面里没有 requestAnimationFrame；用 setTimeout'],
  ['cancelAnimationFrame', '小程序页面里没有 cancelAnimationFrame'],
  ['IntersectionObserver', '用 src/platform 包装的 Taro.createIntersectionObserver'],
  ['ResizeObserver', '小程序没有 ResizeObserver'],
  ['MutationObserver', '小程序没有 MutationObserver'],
  ['matchMedia', '小程序没有 matchMedia'],
  ['getComputedStyle', '小程序没有 getComputedStyle'],
  ['queueMicrotask', 'iOS 老版本没有 queueMicrotask；用 Promise.resolve().then'],
  ['setImmediate', '小程序没有 setImmediate'],
  ['crypto', '小程序没有 Web Crypto'],
  ['globalThis', 'iOS 12.0/12.1 没有 globalThis'],
].map(([name, message]) => ({ name, message }));

/** Methods newer than the iOS 12 floor that Babel does not polyfill (`useBuiltIns: false`). */
const MISSING_METHODS = [
  { property: 'matchAll', message: 'iOS 12 没有 String.prototype.matchAll；用 RegExp exec 循环' },
  { property: 'replaceAll', message: 'iOS 12 没有 replaceAll；用带 g 的正则 replace' },
  {
    object: 'Object',
    property: 'hasOwn',
    message: 'iOS 12 没有 Object.hasOwn；用 Object.prototype.hasOwnProperty.call',
  },
  { object: 'Promise', property: 'any', message: 'iOS 12 没有 Promise.any' },
  {
    object: 'Object',
    property: 'fromEntries',
    message: 'iOS 12.0/12.1 没有 Object.fromEntries；用 src/lib/defined.ts 的 fromPairs',
  },
];

/** `@shop/contracts` modules with no zod import, allowed at runtime. */
const CONTRACTS_RUNTIME = [
  '@shop/contracts/decor/link-route',
  '@shop/contracts/storage/image-variants',
  '@shop/contracts/system/theme',
];

export default [
  ...shopConfig({
    kind: 'tooling',
    ignores: ['.swc/**', '.bundle-stats/**'],
    extraDeny: [
      {
        source: '^@shop/(core|db|testing)(/|$)',
        message: '小程序不得依赖服务端包（core / db / testing）',
      },
      {
        source: '^zod($|/)',
        exceptFrom: '\\.test\\.tsx?$',
        message: '小程序运行时不带 zod（包体积；契约只 import 类型）',
      },
    ],
  }),
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: `^@shop/contracts(?!(${CONTRACTS_RUNTIME.map((m) => m.slice('@shop/contracts'.length)).join('|')})$)(/.*)?$`,
              allowTypeImports: true,
              message: '契约只 import 类型（import type），运行时不带 zod',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['src/platform/**', 'src/test/**', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            REACT_19_ONLY,
            {
              name: '@tarojs/taro',
              allowImportNames: TARO_HOOKS,
              message: '平台 API 只在 src/platform 里调用；页面只用 Taro 的生命周期 hooks',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/platform/**', 'src/test/**', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    rules: { 'no-restricted-imports': ['error', { paths: [REACT_19_ONLY] }] },
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: [
      // Build time, in Node: the app and page configs become app.json / page .json files.
      'src/app.config.ts',
      'src/**/index.config.ts',
      // H5-only: the e2e emulation and the DIY preview run in a browser.
      'src/platform/*.h5.ts',
      'src/platform/*.h5.tsx',
      'src/platform/h5-*.ts',
      'src/platform/h5-*.tsx',
      'src/test/**',
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
    ],
    rules: {
      'no-restricted-globals': ['error', ...MISSING_ON_WEAPP],
      'no-restricted-properties': ['error', ...MISSING_METHODS],
      // The preset turns this off for `.ts` outside core; keep the ban on dynamic code.
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Function']",
          message: 'new Function 被静态守卫禁止',
        },
        {
          selector: "CallExpression[callee.property.name='at'][arguments.length=1]",
          message: 'iOS 12 没有 Array/String.prototype.at；用 [i] 或 [length - 1]',
        },
      ],
    },
  },
  {
    files: ['src/**/*.tsx', 'src/**/*.ts'],
    ...reactHooks.configs.flat.recommended,
  },
  {
    // Tests may reach the fake runtime directly.
    files: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/test/**'],
    rules: { 'no-console': 'off', '@typescript-eslint/no-explicit-any': 'off' },
  },
];
