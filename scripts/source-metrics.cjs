#!/usr/bin/env node
'use strict';
/**
 * Recompute the source-size records in docs/ deterministically.
 *
 * Both the baseline and the current revision are measured with the same
 * category rules, so the reduction figure can be reproduced instead of
 * trusted. Run it after a cleanup batch and commit the refreshed docs.
 *
 *   node scripts/source-metrics.cjs            # print
 *   node scripts/source-metrics.cjs --write    # update docs/core-store-*.json
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const baseline = process.env.CRMEB_BASELINE || '66681c07';

/** Only text is line-counted; binaries and lockfiles would skew the ratio. */
const BINARY = /\.(png|jpe?g|gif|ico|webp|svg|woff2?|ttf|eot|otf|zip|gz|tar|mp3|mp4|pdf|xlsx?|docx?|lock|dist)$/i;

const CATEGORIES = {
  source: (p) => /^(crmeb\/(app|crmeb|route|config|upgrade)|template\/(admin\/src|uni-app)|scripts|tests|docker)\//.test(p),
  'published-and-assets': (p) => p.startsWith('crmeb/public/'),
  vendored: (p) => p.startsWith('crmeb/vendor/'),
};
CATEGORIES.other = () => true;

function git(args) {
  return execFileSync('git', args, { cwd: root, maxBuffer: 512 * 1024 * 1024 });
}

/** name -> { sha, bytes } for every blob at a revision. */
function blobsAt(rev) {
  // `-l` reports the blob size and `-z` keeps names with spaces intact.
  const raw = git(['ls-tree', '-r', '-l', '-z', rev]).toString('utf8');
  const out = new Map();
  for (const entry of raw.split('\0')) {
    if (!entry) continue;
    const tab = entry.indexOf('\t');
    if (tab === -1) continue;
    // "<mode> <type> <sha> <size>\t<path>"
    const meta = entry.slice(0, tab).split(/\s+/);
    if (meta.length < 4 || meta[1] !== 'blob') continue;
    out.set(entry.slice(tab + 1), { sha: meta[2], bytes: Number(meta[3]) });
  }

  const files = [...out.keys()];
  const shas = files.map((f) => out.get(f).sha);
  const input = shas.join('\n') + '\n';
  const blobOut = execFileSync('git', ['cat-file', '--batch'], {
    cwd: root, input, maxBuffer: 1024 * 1024 * 1024,
  });
  let offset = 0;
  for (const file of files) {
    const headerEnd = blobOut.indexOf(0x0a, offset);
    const size = Number(blobOut.slice(offset, headerEnd).toString().split(' ')[2]);
    const bodyStart = headerEnd + 1;
    out.get(file).lines = BINARY.test(file) ? 0 : blobOut.slice(bodyStart, bodyStart + size).toString('utf8').split('\n').length - 1;
    offset = bodyStart + size + 1;
  }
  return out;
}

function summarise(stats) {
  const out = {};
  for (const [name, match] of Object.entries(CATEGORIES)) out[name] = { files: 0, bytes: 0, lines: 0 };
  // Assign each file to the first matching category; `other` takes the rest.
  for (const [file, { bytes, lines }] of stats) {
    let chosen = 'other';
    for (const [name, match] of Object.entries(CATEGORIES)) {
      if (name === 'other') continue;
      if (match(file)) { chosen = name; break; }
    }
    out[chosen].files += 1;
    out[chosen].bytes += bytes;
    out[chosen].lines += lines;
  }
  return out;
}

const before = summarise(blobsAt(baseline));
const after = summarise(blobsAt('HEAD'));

const reduction = {
  files: before.source.files - after.source.files,
  bytes: before.source.bytes - after.source.bytes,
  lines: before.source.lines - after.source.lines,
};
const percent = before.source.lines
  ? Math.round((reduction.lines / before.source.lines) * 1000) / 10
  : 0;

const result = {
  baseline_commit: git(['rev-parse', baseline]).toString().trim(),
  head_commit: git(['rev-parse', 'HEAD']).toString().trim(),
  categories: after,
  source_reduction: reduction,
  source_physical_line_reduction_percent: percent,
};

console.log(JSON.stringify({ baseline: before, head: after, reduction, percent }, null, 2));

if (process.argv.includes('--write')) {
  const docs = path.join(root, 'docs');
  const resultFile = path.join(docs, 'core-store-result.json');
  // Hand-written keys such as the validation record are not recomputed here,
  // so carry them over instead of dropping them on every refresh.
  let carried = {};
  if (fs.existsSync(resultFile)) {
    try {
      const previous = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
      for (const [key, value] of Object.entries(previous)) {
        if (!(key in result)) carried[key] = value;
      }
    } catch { /* first write */ }
  }
  fs.writeFileSync(
    path.join(docs, 'core-store-baseline.json'),
    JSON.stringify({ commit: result.baseline_commit, categories: before }, null, 2) + '\n'
  );
  fs.writeFileSync(resultFile, JSON.stringify({ ...result, ...carried }, null, 2) + '\n');
  console.log('\nwrote docs/core-store-baseline.json and docs/core-store-result.json');
}
