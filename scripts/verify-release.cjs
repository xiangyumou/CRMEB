#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function digest(file) {
  if (fs.lstatSync(file).isSymbolicLink()) throw Error(`Symlink is not allowed: ${file}`);
  if (fs.statSync(file).isFile()) return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (!fs.statSync(file).isDirectory()) throw Error(`Unsupported artifact: ${file}`);
  const files = [];
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const child = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw Error(`Symlink is not allowed: ${child}`);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile()) files.push(child);
      else throw Error(`Unsupported artifact: ${child}`);
    }
  }
  visit(file);
  if (!files.length) throw Error(`Empty artifact: ${file}`);
  files.sort((a, b) => {
    const left = path.relative(file, a).split(path.sep).join('/');
    const right = path.relative(file, b).split(path.sep).join('/');
    return left < right ? -1 : left > right ? 1 : 0;
  });
  const hash = crypto.createHash('sha256');
  for (const item of files) {
    hash.update(path.relative(file, item).split(path.sep).join('/'));
    hash.update('\0');
    hash.update(crypto.createHash('sha256').update(fs.readFileSync(item)).digest('hex'));
    hash.update('\n');
  }
  return hash.digest('hex');
}

function verify(filename) {
  const manifest = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (!/^(v\d+\.\d+\.\d+|sha-[a-f0-9]{40})$/.test(manifest.releaseVersion)) throw Error('Invalid releaseVersion');
  if (!/^[a-f0-9]{40}$/.test(manifest.gitCommit)) throw Error('Invalid gitCommit');
  if (manifest.releaseVersion.startsWith('sha-') && manifest.releaseVersion.slice(4) !== manifest.gitCommit) throw Error('Release SHA mismatch');
  if (!/^sha256:[a-f0-9]{64}$/.test(manifest.backendImageDigest)) throw Error('Invalid backendImageDigest');
  for (const platform of ['admin', 'h5', 'mpWeixin']) {
    const value = manifest[platform];
    if (!value || value.gitCommit !== manifest.gitCommit || typeof value.toolVersion !== 'string' || !value.toolVersion.trim()) throw Error(`Invalid ${platform} source or toolVersion`);
    if (!/^[a-f0-9]{64}$/.test(value.artifactSha256) || typeof value.artifactPath !== 'string') throw Error(`Invalid ${platform} artifact fields`);
    const artifact = path.resolve(path.dirname(filename), value.artifactPath);
    if (digest(artifact) !== value.artifactSha256) throw Error(`${platform} artifactSha256 mismatch`);
  }
  if (manifest.mpWeixin.publishable !== undefined && typeof manifest.mpWeixin.publishable !== 'boolean') throw Error('Invalid mpWeixin publishable');
  console.log(`Release ${manifest.releaseVersion} artifacts verified`);
}

try {
  if (process.argv.length !== 3) throw Error('Usage: node scripts/verify-release.cjs /absolute/path/release.json');
  verify(path.resolve(process.argv[2]));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
