import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The H5 bundle `edge.ts` serves.
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
export const H5_DIST_DIR = path.join(UNI_APP_DIR, 'dist', 'dev', 'h5');

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

function isDistFresh(): boolean {
  const marker = path.join(H5_DIST_DIR, 'index.html');
  if (!existsSync(marker)) return false;
  const distMtime = statSync(marker).mtimeMs;
  const sourceMtime = Math.max(
    ...SOURCE_ENTRIES.map((entry) => newestMtimeMs(path.join(UNI_APP_DIR, entry))),
  );
  return distMtime >= sourceMtime;
}

/**
 * Builds the H5 bundle if `dist/dev/h5` is stale, otherwise does nothing.
 * Logs go to the parent's stdout/stderr so a CI run's build log shows them.
 */
export async function ensureH5Build(options: { log: (line: string) => void }): Promise<void> {
  if (isDistFresh()) {
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
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
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
