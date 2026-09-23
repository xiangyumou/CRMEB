import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CLIENT } from './stack-file';

/**
 * The H5 bundle `edge.ts` serves: the uni-app's (default) or, with
 * `SHOP_E2E_CLIENT=mini`, the Taro mini-program's "模拟小程序" build (see the
 * end of this file).
 *
 * The uni-app is its own npm project, but this suite is the one harness that
 * needs an H5 build, so it builds one itself. `pnpm run build:h5` (vue-cli-service
 * `uni-build`) always writes to `dist/dev/h5` — there is no `NODE_ENV`
 * switch in its script, so that is the one output directory this ever reads.
 *
 * Rebuilding on every run would cost roughly a minute the suite does not
 * need to pay when nothing changed: `dist/dev/h5` is skipped when it is
 * newer than every file uni-app actually bundles from.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
/**
 * The uni-app source tree to build and serve. `SHOP_E2E_UNIAPP_DIR` points
 * the suite at another checkout, so a storefront fix in another worktree can
 * run these journeys against its own `apps/uni-app` without touching
 * this one.
 */
export const UNI_APP_DIR = process.env.SHOP_E2E_UNIAPP_DIR
  ? path.resolve(process.env.SHOP_E2E_UNIAPP_DIR)
  : path.join(HERE, '..', '..', '..', 'apps', 'uni-app');
const UNI_APP_DIST_DIR = path.join(UNI_APP_DIR, 'dist', 'dev', 'h5');

/** Directories `build:h5` actually reads from. Mirrors `pages.json`'s world, not `dist`/`node_modules`/`tests`. */
const SOURCE_ENTRIES = [
  'App.vue',
  'main.js',
  'manifest.json',
  'pages.json',
  'uni.scss',
  'vue.config.js',
  'babel.config.js',
  'postcss.config.js',
  'pages',
  'components',
  'subpackage',
  'api',
  'utils',
  'libs',
  'config',
  'mixins',
  'store',
  'static',
  'public',
];

function newestMtimeMs(entry: string): number {
  const stats = statSync(entry, { throwIfNoEntry: false });
  if (!stats) return 0;
  if (stats.isFile()) return stats.mtimeMs;
  if (!stats.isDirectory()) return 0;
  let newest = stats.mtimeMs;
  for (const child of readdirSync(entry)) {
    newest = Math.max(newest, newestMtimeMs(path.join(entry, child)));
  }
  return newest;
}

function isDistFresh(distDir: string, sources: string[]): boolean {
  const marker = path.join(distDir, 'index.html');
  if (!existsSync(marker)) return false;
  const distMtime = statSync(marker).mtimeMs;
  const sourceMtime = Math.max(...sources.map(newestMtimeMs));
  return distMtime >= sourceMtime;
}

/**
 * The mini-program (`apps/mini`) built for H5 as "模拟小程序":
 * `TARO_APP_PLATFORM_EMULATION=mp`, so it signs in with `wx.login` codes and
 * pays through `requestPayment` like the WeChat build, answered by the
 * harness (`gateway-control.ts`) instead of WeChat. Its own output directory:
 * the plain `build:h5` (the DIY preview) never carries the emulation.
 */
const REPO_ROOT = path.join(HERE, '..', '..', '..');
export const MINI_DIR = path.join(REPO_ROOT, 'apps', 'mini');
const MINI_DIST_DIR = path.join(MINI_DIR, 'dist', 'h5-mp-emulation');
/** What the mini build compiles: the app, its config and the workspace sources it includes. */
const MINI_SOURCES = [
  path.join(MINI_DIR, 'src'),
  path.join(MINI_DIR, 'config'),
  path.join(MINI_DIR, 'babel.config.js'),
  path.join(MINI_DIR, 'package.json'),
  path.join(REPO_ROOT, 'packages', 'api-client', 'src'),
  path.join(REPO_ROOT, 'packages', 'contracts', 'src'),
  path.join(REPO_ROOT, 'packages', 'storefront-blocks', 'src'),
];

/** The directory the edge serves for this run's client. */
export const H5_DIST_DIR = CLIENT === 'mini' ? MINI_DIST_DIR : UNI_APP_DIST_DIR;

/**
 * Builds this run's H5 bundle if it is stale, otherwise does nothing.
 * Logs go to the parent's stdout/stderr so a CI run's build log shows them.
 */
export async function ensureH5Build(options: { log: (line: string) => void }): Promise<void> {
  if (CLIENT === 'mini') {
    if (isDistFresh(MINI_DIST_DIR, MINI_SOURCES)) {
      options.log('h5: apps/mini/dist/h5-mp-emulation is up to date, skipping build');
      return;
    }
    options.log('h5: building apps/mini (pnpm run build:h5:mp-emulation)');
    // A production build whatever the caller's NODE_ENV: that is what ships.
    await run('pnpm', ['run', 'build:h5:mp-emulation'], MINI_DIR, options.log, {
      NODE_ENV: 'production',
    });
    return;
  }
  const sources = SOURCE_ENTRIES.map((entry) => path.join(UNI_APP_DIR, entry));
  if (isDistFresh(UNI_APP_DIST_DIR, sources)) {
    options.log('h5: dist/dev/h5 is up to date, skipping build');
    return;
  }
  options.log('h5: building (pnpm run build:h5) — dist/dev/h5 is stale or missing');
  await run('npm', ['run', 'build:h5'], UNI_APP_DIR, options.log);
}

function run(
  command: string,
  args: string[],
  cwd: string,
  log: (line: string) => void,
  env: NodeJS.ProcessEnv = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });
    child.stdout?.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString('utf8').split('\n')) if (line.trim()) log(`h5: ${line}`);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString('utf8').split('\n')) if (line.trim()) log(`h5: ${line}`);
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}
