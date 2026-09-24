/**
 * What `preview.mjs` and `upload.mjs` check before anything goes to WeChat's servers
 * (docs/mini/device-check.md). Each `refuse`s with the reason and exit 1.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { gateProblem } from './gate-stamp.mjs';

export const appRoot = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(appRoot, '../..');

export function refuser(name) {
  return (message) => {
    console.error(`${name}: ${message}`);
    process.exit(1);
  };
}

/**
 * The upload key named by `WX_MINI_UPLOAD_KEY_PATH` (公众平台 → 开发管理 → 开发设置 → 小程序代码上传).
 * It is a credential: outside the repository, or inside it only where git ignores it
 * (`private.*.key` in .gitignore), so it can never be committed.
 */
export function uploadKey(refuse) {
  const keyEnv = process.env.WX_MINI_UPLOAD_KEY_PATH;
  if (!keyEnv) {
    refuse('WX_MINI_UPLOAD_KEY_PATH is not set. Point it at the upload key (never committed).');
  }
  const keyPath = path.resolve(keyEnv.replace(/^~(?=$|\/)/, process.env.HOME ?? '~'));
  if (!fs.existsSync(keyPath) || !fs.statSync(keyPath).isFile()) {
    refuse(`WX_MINI_UPLOAD_KEY_PATH: ${keyPath} is not a file`);
  }
  const realKey = fs.realpathSync(keyPath);
  const fromRepo = path.relative(fs.realpathSync(repoRoot), realKey);
  if (!fromRepo.startsWith('..') && !path.isAbsolute(fromRepo)) {
    const ignored = spawnSync('git', ['check-ignore', '-q', realKey], { cwd: repoRoot });
    if (ignored.status !== 0) {
      refuse(
        `${realKey} is inside the repository and git does not ignore it; move it outside (and rotate it if it was ever committed)`,
      );
    }
  }
  return realKey;
}

/** `dist/weapp` with a real AppID, and passed by size-report on exactly these files. */
export function gatedBuild(refuse) {
  const dist = path.join(appRoot, 'dist/weapp');
  const projectFile = path.join(dist, 'project.config.json');
  if (!fs.existsSync(projectFile)) {
    refuse('dist/weapp not found; run scripts/device-build.mjs first');
  }
  const { appid } = JSON.parse(fs.readFileSync(projectFile, 'utf8'));
  if (typeof appid !== 'string' || !/^wx[0-9a-f]{16}$/.test(appid)) {
    refuse(
      `dist/weapp is built for ${String(appid)}; WeChat needs a real AppID (device-build --appid)`,
    );
  }
  const problem = gateProblem(dist);
  if (problem) refuse(`dist/weapp: ${problem}`);
  return { dist, appid };
}

/** The miniprogram-ci CLI, which this repository does not install. */
export function miniprogramCi(refuse) {
  if (process.env.MINIPROGRAM_CI_BIN) return process.env.MINIPROGRAM_CI_BIN;
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const candidate = path.join(dir, 'miniprogram-ci');
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // not here
    }
  }
  refuse('miniprogram-ci is not installed; `npm i -g miniprogram-ci` (outside this repository)');
}
