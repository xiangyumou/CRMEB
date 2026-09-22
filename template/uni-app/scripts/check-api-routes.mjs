#!/usr/bin/env node
//
// Proves that the storefront only talks to routes the contracts actually describe.
//
// For every `request.<verb>('/api/v1/…')` in `api/*.js` (and the `uni.uploadFile`
// site in `utils/util.js`) it:
//
//   1. normalises the template literal — `${id}` becomes `:param`;
//   2. looks the method+path up in `next/packages/contracts/openapi.json`;
//   3. reports it as LIVE when it resolves, PENDING when the line above it carries a
//      `// CONTRACT-PENDING(<stream>)` marker, and FAILS otherwise;
//   4. fails on any URL that still looks like a retired feature or a legacy endpoint.
//
// Usage:
//   node scripts/check-api-routes.mjs            # human-readable report, exit 1 on failure
//   node scripts/check-api-routes.mjs --json     # machine-readable

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '..');
const OPENAPI = path.resolve(APP, '../../next/packages/contracts/openapi.json');

const RETIRED = [
  'bargain',
  'seckill',
  'lottery',
  'live',
  'spread',
  'brokerage',
  'commission',
  'integral',
  'sign',
  'member-card',
  'recharge',
  'balance',
  'alipay',
  'offline',
  'store-pickup',
  'verify-code',
  'kefu',
  'chat',
];

/**
 * `/api/v1/orders/${id}/cancel` → `/api/v1/orders/:param/cancel`.
 * Interpolations nest (`${(data || {}).id}`), so the braces are matched by hand.
 */
function normalise(raw) {
  let out = '';
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] !== '$' || raw[i + 1] !== '{') {
      out += raw[i];
      continue;
    }
    let depth = 0;
    let j = i + 1;
    for (; j < raw.length; j += 1) {
      if (raw[j] === '{') depth += 1;
      else if (raw[j] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out += ':param';
    i = j;
  }
  return out;
}

/** `/api/v1/orders/{id}` → `/api/v1/orders/:param` */
function fromOpenApi(raw) {
  return raw.replace(/\{[^}]*\}/g, ':param');
}

function loadOpenApi() {
  if (!fs.existsSync(OPENAPI)) {
    console.error(`openapi.json not found at ${OPENAPI} — run \`pnpm gen\` in next/ first.`);
    process.exit(2);
  }
  const doc = JSON.parse(fs.readFileSync(OPENAPI, 'utf8'));
  const known = new Set();
  for (const [p, ops] of Object.entries(doc.paths || {})) {
    for (const method of Object.keys(ops)) {
      known.add(`${method.toUpperCase()} ${fromOpenApi(p)}`);
    }
  }
  return known;
}

// `request.get(` and the chained `request\n  .get(` spelling both count: a composed
// call (`.then(...)` on the end) is usually written the second way, and a guard that
// could not see it would go quiet exactly where the interesting calls are.
const CALL = /\brequest\s*\.\s*(get|post|put|patch|delete)\s*\(\s*(['"`])((?:\\.|(?!\2)[\s\S])*)\2/g;
const ANY_CALL = /\brequest\s*\.\s*(get|post|put|patch|delete)\s*\(\s*/g;
const MARKER = /CONTRACT-PENDING\(([^)]+)\)/;
const DIVIDER = /^\s*\/\/\s*-{10,}\s*$/;

const COMMENT = /^\s*\/\//;

/**
 * A `// CONTRACT-PENDING(<stream>)` marker covers every call below it until a `// -----`
 * section divider that does not belong to a marker's own header, or until the next
 * marker. That is exactly how the api modules are laid out.
 *
 * The unit is the **comment block**, not the line: a marker's explanation often runs for
 * several lines and is closed by the divider underneath it, and that divider must not
 * cancel the marker that introduced it.
 */
function pendingByLine(lines) {
  const active = new Array(lines.length).fill(null);
  let current = null;
  let i = 0;
  while (i < lines.length) {
    if (!COMMENT.test(lines[i])) {
      active[i] = current;
      i += 1;
      continue;
    }
    let end = i;
    let marker = null;
    let divider = false;
    while (end < lines.length && COMMENT.test(lines[end])) {
      const m = MARKER.exec(lines[end]);
      if (m) marker = m[1];
      else if (DIVIDER.test(lines[end])) divider = true;
      end += 1;
    }
    if (marker) current = marker;
    else if (divider) current = null;
    for (; i < end; i += 1) active[i] = current;
  }
  return active;
}

function scan(file) {
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');
  const active = pendingByLine(lines);
  const found = [];
  let m;
  // Every `request.*(` must be followed by a string literal. A URL assembled out of
  // variables is invisible to this script, and an invisible call is the one failure
  // mode a route guard cannot have: the count would still read "0 broken".
  ANY_CALL.lastIndex = 0;
  while ((m = ANY_CALL.exec(src)) !== null) {
    if (/^['"`]/.test(src.slice(ANY_CALL.lastIndex))) continue;
    // Prose mentions `request.get(...)` too; only code counts.
    const before = src.slice(src.lastIndexOf('\n', m.index) + 1, m.index);
    if (before.includes('//') || /^\s*\*/.test(before)) continue;
    found.push({
      file: path.relative(APP, file),
      line: src.slice(0, m.index).split('\n').length,
      method: m[1].toUpperCase(),
      url: null,
      pending: null,
    });
  }
  CALL.lastIndex = 0;
  while ((m = CALL.exec(src)) !== null) {
    const line = src.slice(0, m.index).split('\n').length;
    found.push({
      file: path.relative(APP, file),
      line,
      method: m[1].toUpperCase(),
      url: normalise(m[3]),
      pending: active[line - 1] || null,
    });
  }
  return found;
}

/** A retired word only counts when it is a whole path segment or a whole hyphen token. */
function retiredWordIn(url) {
  const tokens = new Set();
  for (const segment of url.split('/')) {
    if (!segment) continue;
    tokens.add(segment);
    for (const token of segment.split('-')) tokens.add(token);
  }
  return RETIRED.find((word) => tokens.has(word)) || null;
}

const known = loadOpenApi();
const apiDir = path.join(APP, 'api');
const calls = [];
for (const name of fs.readdirSync(apiDir).sort()) {
  if (name.endsWith('.js')) calls.push(...scan(path.join(apiDir, name)));
}
// The upload helper builds its URL from `API_PREFIX`; assert it by hand.
const util = fs.readFileSync(path.join(APP, 'utils/util.js'), 'utf8');
if (util.includes('API_PREFIX + "/uploads?purpose='))
  calls.push({ file: 'utils/util.js', line: 0, method: 'POST', url: '/api/v1/uploads', pending: null });

const failures = [];
const live = [];
const pending = [];

for (const c of calls) {
  if (c.url === null) {
    failures.push({ ...c, url: '(computed)', why: 'the URL is not a literal, so this script cannot check it' });
    continue;
  }
  const url = c.url.split('?')[0];
  if (!url.startsWith('/api/v1/')) {
    failures.push({ ...c, why: 'not a /api/v1 route' });
    continue;
  }
  const retired = retiredWordIn(url);
  if (retired) {
    failures.push({ ...c, why: `retired feature in the path: ${retired}` });
    continue;
  }
  if (known.has(`${c.method} ${url}`)) {
    live.push(c);
    if (c.pending) failures.push({ ...c, why: `marked CONTRACT-PENDING(${c.pending}) but the route exists — clear the marker` });
    continue;
  }
  if (c.pending) {
    pending.push(c);
    continue;
  }
  failures.push({ ...c, why: 'no such method+path in openapi.json and no CONTRACT-PENDING marker' });
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ live: live.length, pending, failures }, null, 2));
} else {
  console.log(`${calls.length} calls: ${live.length} live, ${pending.length} pending, ${failures.length} broken`);
  const byStream = {};
  for (const c of pending) byStream[c.pending] = (byStream[c.pending] || 0) + 1;
  for (const [stream, n] of Object.entries(byStream).sort()) console.log(`  pending ${stream}: ${n}`);
  for (const f of failures) console.log(`  FAIL ${f.file}:${f.line} ${f.method} ${f.url} — ${f.why}`);
}

process.exit(failures.length ? 1 : 0);
