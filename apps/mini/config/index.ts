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
const workspaceSources = [path.join(repoRoot, 'packages/contracts/src')];

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

interface Chain {
  plugin: (name: string) => { use: (plugin: unknown, args?: unknown[]) => void };
  performance: { hints: (value: false) => void };
}

function webpackChain(chain: Chain) {
  chain.plugin('global-object').use(GlobalObjectPlugin);
  // Every build records its module list for scripts/size-report.mjs (a flag would not survive
  // turbo's strict env mode, and the file is small).
  const platform = process.env.TARO_ENV ?? 'weapp';
  const outFile = path.join(appRoot, '.bundle-stats', `${platform}.json`);
  chain.plugin('bundle-stats').use(BundleStatsPlugin, [outFile]);
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
    outputRoot: `dist/${process.env.TARO_ENV ?? 'weapp'}`,
    plugins: [],
    defineConstants: {},
    alias: {
      '@': path.join(appRoot, 'src'),
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
