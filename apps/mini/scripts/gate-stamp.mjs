/**
 * The record that `size-report.mjs` passed on exactly the files now in a build folder
 * (`dist/weapp` → `dist/weapp.gate.json`, beside it so it is never uploaded).
 *
 * A build reaches WeChat only through `preview.mjs` or `upload.mjs`, and both refuse a folder
 * whose files are not the ones the gate passed: a `taro build` or `dev:weapp` run after the gate
 * (or instead of it) changes them. That is how `> *` reached a trial build once while the gate
 * already forbade it (ca110d376).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** DevTools' own files: not part of the uploaded package. */
export const NOT_UPLOADED = new Set(['project.config.json', 'project.private.config.json']);

export function stampPath(dist) {
  return `${dist.replace(/[\\/]+$/, '')}.gate.json`;
}

/** One hash over every uploaded file's path and bytes, in path order. */
export function fingerprint(dist) {
  const hash = crypto.createHash('sha256');
  const files = fs
    .readdirSync(dist, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path.relative(dist, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'),
    )
    .filter((rel) => !NOT_UPLOADED.has(rel))
    .sort();
  for (const rel of files) {
    hash.update(`${rel}\0`);
    hash.update(fs.readFileSync(path.join(dist, rel)));
    hash.update('\0');
  }
  return { files: files.length, sha256: hash.digest('hex') };
}

export function clearStamp(dist) {
  fs.rmSync(stampPath(dist), { force: true });
}

export function writeStamp(dist) {
  const stamp = { passedAt: new Date().toISOString(), ...fingerprint(dist) };
  fs.writeFileSync(stampPath(dist), `${JSON.stringify(stamp, null, 2)}\n`);
}

/** Why `dist` may not be uploaded, or `null` when the gate passed on these very files. */
export function gateProblem(dist) {
  const file = stampPath(dist);
  if (!fs.existsSync(file)) {
    return 'size-report has not passed on this build; build it with `pnpm build:weapp` or scripts/device-build.mjs';
  }
  const stamp = JSON.parse(fs.readFileSync(file, 'utf8'));
  const now = fingerprint(dist);
  if (stamp.sha256 !== now.sha256) {
    return `the files changed after size-report passed (${stamp.passedAt}); rebuild with \`pnpm build:weapp\` or scripts/device-build.mjs`;
  }
  return null;
}
