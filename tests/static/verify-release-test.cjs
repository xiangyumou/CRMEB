'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crmeb-release-test-'));
const verifier = path.resolve(__dirname, '../../scripts/verify-release.cjs');
try {
  const hash = crypto.createHash('sha256').update('artifact').digest('hex');
  const commit = 'a'.repeat(40);
  const manifest = {
    releaseVersion: 'v1.0.0', gitCommit: commit,
    backendImageDigest: `sha256:${'b'.repeat(64)}`,
  };
  for (const target of ['admin', 'h5', 'mpWeixin']) {
    fs.writeFileSync(path.join(dir, target + '.zip'), 'artifact');
    manifest[target] = { gitCommit: commit, toolVersion: 'verified-test-version', artifactPath: target + '.zip', artifactSha256: hash };
  }
  const filename = path.join(dir, 'release.json');
  const run = () => {
    fs.writeFileSync(filename, JSON.stringify(manifest));
    return spawnSync(process.execPath, [verifier, filename], { encoding: 'utf8' });
  };
  assert.strictEqual(run().status, 0, 'valid matching artifacts should pass');
  const nested = path.join(dir, 'admin');
  fs.mkdirSync(path.join(nested, 'a'), { recursive: true });
  fs.writeFileSync(path.join(nested, 'a', 'nested.js'), 'nested');
  fs.writeFileSync(path.join(nested, 'a.txt'), 'outer');
  const expected = crypto.createHash('sha256');
  for (const name of ['a.txt', 'a/nested.js']) {
    expected.update(name);
    expected.update('\0');
    expected.update(crypto.createHash('sha256').update(fs.readFileSync(path.join(nested, name))).digest('hex'));
    expected.update('\n');
  }
  manifest.admin.artifactPath = 'admin';
  manifest.admin.artifactSha256 = expected.digest('hex');
  assert.strictEqual(run().status, 0, 'directory artifact must hash sorted relative paths');
  manifest.admin.artifactPath = 'admin.zip';
  manifest.admin.artifactSha256 = hash;
  fs.writeFileSync(path.join(dir, 'h5.zip'), 'different');
  assert.notStrictEqual(run().status, 0, 'modified artifact must fail');
  fs.writeFileSync(path.join(dir, 'h5.zip'), 'artifact');
  manifest.mpWeixin.gitCommit = 'c'.repeat(40);
  assert.notStrictEqual(run().status, 0, 'mixed source commits must fail');
  manifest.mpWeixin.gitCommit = commit;
  manifest.releaseVersion = `sha-${commit}`;
  manifest.mpWeixin.publishable = false;
  assert.strictEqual(run().status, 0, 'full SHA release with test mini program should pass');
  manifest.releaseVersion = `sha-${'b'.repeat(40)}`;
  assert.notStrictEqual(run().status, 0, 'mismatched release SHA must fail');
  manifest.releaseVersion = `sha-${commit}`;
  manifest.mpWeixin.publishable = 'false';
  assert.notStrictEqual(run().status, 0, 'invalid publishable flag must fail');
  manifest.mpWeixin.publishable = false;
  fs.unlinkSync(path.join(dir, 'admin.zip'));
  assert.notStrictEqual(run().status, 0, 'missing artifact must fail');
  console.log('Release manifest valid, mismatch, mixed commit, missing artifact: OK');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
