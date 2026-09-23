import path from 'node:path';
import { defineConfig, type UserConfigExport } from '@tarojs/cli';
import { BundleStatsPlugin } from './bundle-stats';
import devConfig from './dev';
import { GlobalObjectPlugin } from './global-object-plugin';
import prodConfig from './prod';

const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appRoot, '../..');

/**
 * Workspace packages the mini-program imports as TypeScript source. Taro's script rule only
 * runs babel over `src/` and over `node_modules` paths containing "taro"; pnpm links a
 * workspace package by symlink and webpack resolves it to its real path, which is neither.
 * Without this, `import … from '@shop/contracts/…'` fails with "no loader for .ts".
 */
const workspaceSources = [
  path.join(repoRoot, 'packages/contracts/src'),
  path.join(repoRoot, 'packages/api-client/src'),
  path.join(repoRoot, 'packages/storefront-blocks/src'),
];

/**
 * One copy each of React and TanStack Query. `@shop/api-client` resolves both from its own
 * `node_modules` (its dev dependencies are React 19 and a Query built against it); the
 * mini-program must use its own React 18 and the Query instance its `QueryClientProvider`
 * lives in, or the hooks see no client and React throws "invalid hook call".
 */
function ownCopy(name: string): string {
  return path.dirname(require.resolve(`${name}/package.json`, { paths: [appRoot] }));
}
const singletons = {
  react: ownCopy('react'),
  '@tanstack/react-query': ownCopy('@tanstack/react-query'),
  '@tanstack/query-core': path.dirname(
    require.resolve('@tanstack/query-core/package.json', {
      paths: [ownCopy('@tanstack/react-query')],
    }),
  ),
};

/**
 * `TARO_APP_PLATFORM_EMULATION=mp` builds the H5 app as the e2e suite's "模拟小程序"
 * (`src/platform/h5-mp-emulation.tsx`) into its own directory. Only H5 may carry it: the
 * WeChat package must never contain test-only code, so asking for it there is an error.
 */
const emulation = process.env.TARO_APP_PLATFORM_EMULATION ?? '';
const taroEnv = process.env.TARO_ENV ?? 'weapp';
if (emulation !== '' && (emulation !== 'mp' || taroEnv !== 'h5')) {
  throw new Error(
    `TARO_APP_PLATFORM_EMULATION=${emulation} is only valid as "mp" for an H5 build (TARO_ENV=${taroEnv}).`,
  );
}
const buildName = emulation === 'mp' ? 'h5-mp-emulation' : taroEnv;

/**
 * Dependencies that ship syntax newer than our target (babel.config.js): TanStack Query's
 * "modern" build uses private class fields, zustand uses `??` and `?.`. They go through babel
 * like our own code; the ES2018 check in scripts/size-report.mjs names the next one to add.
 */
const modernDependencies =
  /[\\/]node_modules[\\/](@tanstack[\\/](query-core|react-query)|zustand)[\\/]/;

const compileInclude = [...workspaceSources, modernDependencies];

/**
 * NutUI's styles are written for a 375 px design, ours for 750 px. Taro's pxtransform asks per
 * file, so NutUI keeps its own scale. https://nutui.jd.com/taro/react/3x/#/zh-CN/guide/start-react
 */
function designWidth(input?: string | number | { file?: string | undefined }): number {
  const file = typeof input === 'object' ? (input.file ?? '') : '';
  return file.replace(/\\+/g, '/').includes('@nutui') ? 375 : 750;
}

interface ChainSet {
  add: (value: string) => ChainSet;
}

interface Chain {
  plugin: (name: string) => { use: (plugin: unknown, args?: unknown[]) => void };
  performance: { hints: (value: false) => void };
  resolve: { modules: ChainSet };
}

function webpackChain(chain: Chain) {
  chain.plugin('global-object').use(GlobalObjectPlugin);
  // Every build records its module list for scripts/size-report.mjs (a flag would not survive
  // turbo's strict env mode, and the file is small).
  const outFile = path.join(appRoot, '.bundle-stats', `${buildName}.json`);
  chain.plugin('bundle-stats').use(BundleStatsPlugin, [outFile]);
  // A last resort after the usual node_modules walk: Taro rewrites `@tarojs/components` to
  // its platform plugin, which a workspace package compiled from source (storefront-blocks)
  // cannot reach from its own directory.
  // Taro leaves `resolve.modules` unset, so the walk has to be restated before the fallback.
  chain.resolve.modules.add('node_modules').add(path.join(appRoot, 'node_modules'));
}

// https://docs.taro.zone/docs/next/config
export default defineConfig<'webpack5'>(async (merge) => {
  const baseConfig: UserConfigExport<'webpack5'> = {
    projectName: 'shop-mini',
    date: '2026-9-23',
    designWidth,
    deviceRatio: {
      375: 2,
      640: 2.34 / 2,
      750: 1,
      828: 1.81 / 2,
    },
    sourceRoot: 'src',
    outputRoot: `dist/${buildName}`,
    plugins: [path.join(appRoot, 'config/a11y-plugin.js')],
    defineConstants: {},
    // Compile-time `process.env.*` for src/platform. Taro only defines the `TARO_APP_*` keys it
    // finds in `.env*` files; these two must exist (as `''`) in every build, or the WeChat
    // runtime, which has no `process`, would throw on the bare reference.
    env: {
      TARO_APP_API_ORIGIN: JSON.stringify(process.env.TARO_APP_API_ORIGIN ?? ''),
      TARO_APP_PLATFORM_EMULATION: JSON.stringify(emulation),
    },
    alias: {
      '@': path.join(appRoot, 'src'),
      // React and TanStack Query from this app only: workspace packages compiled from source
      // (api-client, storefront-blocks) would otherwise resolve their React 19 test copies and
      // render React 19 elements into this React 18 tree (React error #31). See `singletons`.
      ...singletons,
    },
    copy: { patterns: [], options: {} },
    framework: 'react',
    compiler: {
      type: 'webpack5',
      // Prebundling (esbuild over node_modules into a local cache) only speeds up watch
      // builds. Off, so every build goes through one webpack module graph; see
      // docs/mini/spikes/S1-taro.md before turning it on.
      prebundle: { enable: false },
    },
    cache: { enable: false },
    mini: {
      webpackChain,
      compile: { include: compileInclude },
      // Modules used only by one sub-package move into that sub-package instead of the main
      // package's common chunk (the main package has a 2 MB hard limit).
      optimizeMainPackage: { enable: true },
      postcss: {
        pxtransform: { enable: true, config: {} },
        cssModules: {
          enable: true,
          config: {
            namingPattern: 'module',
            generateScopedName: '[name]__[local]___[hash:base64:5]',
          },
        },
      },
    },
    h5: {
      publicPath: '/',
      staticDirectory: 'static',
      router: { mode: 'hash' },
      webpackChain(chain: Chain) {
        webpackChain(chain);
        // The H5 build is for e2e and the DIY preview, not for shoppers; webpack's 244 KiB
        // entry-size hint is noise there. The mini-program has its own budget (size-report).
        chain.performance.hints(false);
      },
      compile: { include: compileInclude },
      output: {
        filename: 'js/[name].[contenthash:8].js',
        chunkFilename: 'js/[name].[contenthash:8].js',
      },
      miniCssExtractPluginOption: {
        ignoreOrder: true,
        filename: 'css/[name].[contenthash:8].css',
        chunkFilename: 'css/[name].[contenthash:8].css',
      },
      postcss: {
        autoprefixer: { enable: true, config: {} },
        cssModules: {
          enable: true,
          config: {
            namingPattern: 'module',
            generateScopedName: '[name]__[local]___[hash:base64:5]',
          },
        },
      },
    },
  };

  if (process.env.NODE_ENV === 'development') {
    return merge({}, baseConfig, devConfig);
  }
  return merge({}, baseConfig, prodConfig);
});
