#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const output = path.join(root, '.build', 'release');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const copy = (from, to) => {
  if (!fs.existsSync(from)) throw Error(`Required release input missing: ${from}`);
  fs.cpSync(from, to, { recursive: true, force: true });
};
const digest = (dir) => {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw Error(`Symlink in release: ${file}`);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) files.push(file);
      else throw Error(`Unsupported release file: ${file}`);
    }
  };
  visit(dir);
  if (!files.length) throw Error(`Empty release artifact: ${dir}`);
  const hash = crypto.createHash('sha256');
  for (const file of files.sort()) {
    hash.update(path.relative(dir, file).split(path.sep).join('/'));
    hash.update('\0');
    hash.update(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
    hash.update('\n');
  }
  return hash.digest('hex');
};

const publicDir = path.join(output, 'public');
fs.rmSync(publicDir, { recursive: true, force: true });
fs.mkdirSync(publicDir, { recursive: true });
for (const name of ['index.php', 'router.php', 'mobile.html', 'service_pay_result.html', 'robots.txt', 'favicon.ico', 'statics']) {
  copy(path.join(root, 'crmeb', 'public', name), path.join(publicDir, name));
}
fs.rmSync(path.join(publicDir, 'statics', 'mp_view'), { recursive: true, force: true });
copy(path.join(output, 'mpWeixin'), path.join(publicDir, 'statics', 'mp_view'));
copy(path.join(output, 'admin'), path.join(publicDir, 'admin'));
copy(path.join(output, 'h5', 'index.html'), path.join(publicDir, 'index.html'));
for (const name of fs.readdirSync(path.join(output, 'h5'))) {
  if (name !== 'index.html') copy(path.join(output, 'h5', name), path.join(publicDir, name));
}
fs.writeFileSync(path.join(publicDir, 'install.lock'), 'installed\n');
const meta = {
  gitCommit: revision,
  admin: { artifactSha256: digest(path.join(output, 'admin')), toolVersion: 'Node 20.19.0 / npm 10.8.2' },
  h5: { artifactSha256: digest(path.join(output, 'h5')), toolVersion: 'UniApp 2.0.2-5020420260813001' },
  mpWeixin: {
    artifactSha256: digest(path.join(output, 'mpWeixin')),
    toolVersion: 'UniApp 2.0.2-5020420260813001',
    publishable: Boolean(process.env.CRMEB_MP_APPID && process.env.CRMEB_MP_APPID !== 'wx0000000000000000')
  }
};
fs.writeFileSync(path.join(publicDir, 'release.json'), JSON.stringify(meta, null, 2) + '\n');
fs.writeFileSync(path.join(output, 'build.json'), JSON.stringify(meta, null, 2) + '\n');
console.log(`Assembled release ${revision}`);
