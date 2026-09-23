#!/usr/bin/env node
/**
 * A 真机预览 QR code for `dist/weapp` without 微信开发者工具, through miniprogram-ci's CLI
 * (docs/mini/device-check.md, 「可选：用 miniprogram-ci 出预览码」):
 *
 *   WX_MINI_UPLOAD_KEY_PATH=~/secrets/private.wx4f4b772125e155ed.key \
 *     node scripts/preview.mjs --confirm [--robot 1] [--qr-file /tmp/preview.jpg]
 *
 * **Every run uploads the package to WeChat's servers.** Run it only when the user has approved
 * this one preview; `--confirm` is never defaulted, never read from the environment, and this
 * script never uploads a release (`miniprogram-ci upload` is not wrapped on purpose).
 *
 * It refuses to run unless:
 *
 * - `WX_MINI_UPLOAD_KEY_PATH` names an existing file **outside** the repository (the upload key
 *   from 公众平台 → 开发管理 → 开发设置 → 小程序代码上传; it is a credential, never committed,
 *   and the `mini` guard fails on a `private.*.key` in the tree);
 * - `dist/weapp` exists and its AppID (`project.config.json`) is a real one, not touristappid;
 * - a `miniprogram-ci` executable is on `PATH` or named by `MINIPROGRAM_CI_BIN`. It is not a
 *   dependency of this repository; install it yourself, outside it (`npm i -g miniprogram-ci`).
 *
 * The machine's public IP must be in the key's IP whitelist, or WeChat answers with an
 * "invalid ip" error. The CLI flags are miniprogram-ci's documented `preview` ones (`--pp`,
 * `--pkp`, `--appid`, `--uv`, `-r`, `--qrcode-format`, `--qrcode-output-dest`); check them
 * against `miniprogram-ci preview --help` of the version you install.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const appRoot = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(appRoot, '../..');

const { values: args } = parseArgs({
  options: {
    confirm: { type: 'boolean', default: false },
    robot: { type: 'string', default: '1' },
    'qr-file': { type: 'string' },
  },
});

function refuse(message) {
  console.error(`preview: ${message}`);
  process.exit(1);
}

// --- the upload key: named by the environment, outside the repository ---------------------
const keyEnv = process.env.WX_MINI_UPLOAD_KEY_PATH;
if (!keyEnv) {
  refuse(
    'WX_MINI_UPLOAD_KEY_PATH is not set. Point it at the upload key, kept outside the repository.',
  );
}
const keyPath = path.resolve(keyEnv.replace(/^~(?=$|\/)/, process.env.HOME ?? '~'));
if (!fs.existsSync(keyPath) || !fs.statSync(keyPath).isFile()) {
  refuse(`WX_MINI_UPLOAD_KEY_PATH: ${keyPath} is not a file`);
}
const realKey = fs.realpathSync(keyPath);
const fromRepo = path.relative(fs.realpathSync(repoRoot), realKey);
if (!fromRepo.startsWith('..') && !path.isAbsolute(fromRepo)) {
  refuse(
    `${realKey} is inside the repository; move the key outside it (and rotate it if it was ever committed)`,
  );
}

// --- the build ----------------------------------------------------------------------------
const dist = path.join(appRoot, 'dist/weapp');
const projectFile = path.join(dist, 'project.config.json');
if (!fs.existsSync(projectFile)) refuse('dist/weapp not found; run scripts/device-build.mjs first');
const { appid } = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
if (typeof appid !== 'string' || !/^wx[0-9a-f]{16}$/.test(appid)) {
  refuse(
    `dist/weapp is built for ${String(appid)}; a preview needs a real AppID (device-build --appid)`,
  );
}
if (!/^([1-9]|[12][0-9]|30)$/.test(args.robot)) refuse('--robot is 1–30');

// --- the user's say-so, every time --------------------------------------------------------
if (!args.confirm) {
  refuse(
    `this would upload dist/weapp (AppID ${appid}) to WeChat's servers for a preview QR code. ` +
      'Re-run with --confirm only after the user has approved this preview.',
  );
}

// --- the CLI, which this repository does not install --------------------------------------
function findOnPath(name) {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const candidate = path.join(dir, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // not here
    }
  }
  return undefined;
}
const bin = process.env.MINIPROGRAM_CI_BIN ?? findOnPath('miniprogram-ci');
if (!bin) {
  refuse('miniprogram-ci is not installed; `npm i -g miniprogram-ci` (outside this repository)');
}

const version = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8')).version;
const qr = args['qr-file']
  ? ['--qrcode-format', 'image', '--qrcode-output-dest', path.resolve(args['qr-file'])]
  : ['--qrcode-format', 'terminal'];

console.log(`preview: uploading dist/weapp as AppID ${appid}, robot ${args.robot} …`);
const run = spawnSync(
  bin,
  [
    'preview',
    '--pp',
    dist,
    '--pkp',
    realKey,
    '--appid',
    appid,
    '--uv',
    version,
    '-r',
    args.robot,
    ...qr,
  ],
  { stdio: 'inherit' },
);
if (run.status !== 0) refuse(`miniprogram-ci exited ${run.status ?? run.signal}`);
