#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const [image, destination] = process.argv.slice(2);
if (!/^ghcr\.io\/xiangyumou\/crmeb@sha256:[a-f0-9]{64}$/.test(image) || !destination) {
  throw Error('Usage: node scripts/finalize-release.cjs ghcr.io/xiangyumou/crmeb@sha256:DIGEST OUTPUT');
}
const build = JSON.parse(fs.readFileSync(path.join(path.dirname(destination), 'build.json'), 'utf8'));
if (!/^[a-f0-9]{40}$/.test(build.gitCommit)) throw Error('Invalid source revision');
const release = {
  releaseVersion: `sha-${build.gitCommit}`,
  gitCommit: build.gitCommit,
  backendImageDigest: image.split('@')[1]
};
for (const platform of ['admin', 'h5', 'mpWeixin']) {
  release[platform] = {
    gitCommit: build.gitCommit,
    toolVersion: build[platform].toolVersion,
    artifactPath: platform,
    artifactSha256: build[platform].artifactSha256
  };
}
release.mpWeixin.publishable = build.mpWeixin.publishable;
fs.writeFileSync(destination, JSON.stringify(release, null, 2) + '\n');
