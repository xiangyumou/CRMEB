#!/usr/bin/env node
/**
 * Uploads `dist/weapp` as a development version (公众平台 → 版本管理 → 开发版本, from which the
 * operator picks 体验版 or submits for review), through miniprogram-ci's CLI:
 *
 *   WX_MINI_UPLOAD_KEY_PATH=private.wx4f4b772125e155ed.key \
 *     node apps/mini/scripts/upload.mjs --confirm [--desc "…"] [--robot 1]
 *
 * **Every run uploads the package to WeChat's servers.** Run it only when the user has approved
 * this one upload; `--confirm` is never defaulted and never read from the environment.
 *
 * The version is `package.json`'s (1.0.0); the operator manages versions in 公众平台, so this
 * script takes no version flag. It refuses to run on the same terms as `preview.mjs` (wx-ci.mjs):
 * the key, a real AppID, and a build that size-report passed on exactly as it is now — never a
 * `dev:weapp` or bare `taro build` output, whose stylesheets and scripts nothing has checked.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { appRoot, gatedBuild, miniprogramCi, refuser, uploadKey } from './wx-ci.mjs';

const { values: args } = parseArgs({
  options: {
    confirm: { type: 'boolean', default: false },
    robot: { type: 'string', default: '1' },
    desc: { type: 'string' },
  },
});

const refuse = refuser('upload');
const realKey = uploadKey(refuse);
const { dist, appid } = gatedBuild(refuse);
if (!/^([1-9]|[12][0-9]|30)$/.test(args.robot)) refuse('--robot is 1–30');

const version = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8')).version;
if (!args.confirm) {
  refuse(
    `this would upload dist/weapp (AppID ${appid}) to WeChat's servers as version ${version}. ` +
      'Re-run with --confirm only after the user has approved this upload.',
  );
}

const bin = miniprogramCi(refuse);
const desc = args.desc ?? `${version} ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;

console.log(`upload: dist/weapp as AppID ${appid}, version ${version}, robot ${args.robot} …`);
const run = spawnSync(
  bin,
  [
    'upload',
    '--pp',
    dist,
    '--pkp',
    realKey,
    '--appid',
    appid,
    '--uv',
    version,
    '--ud',
    desc,
    '-r',
    args.robot,
  ],
  { stdio: 'inherit' },
);
if (run.status !== 0) refuse(`miniprogram-ci exited ${run.status ?? run.signal}`);
