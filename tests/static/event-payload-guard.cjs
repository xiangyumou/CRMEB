'use strict';
/**
 * Fail when an event is dispatched with fewer arguments than its listener reads.
 *
 * Both sides of a CRMEB event are dynamic: `event('X', [...])` and
 * `[$a, $b, $c] = $event;`. Nothing checks that the array still has as many
 * elements as the listener destructures, so trimming a payload only shows up as
 * a null flowing into a typed parameter at request time — the order-create
 * listener lost `$seckillId`/`$bargainId` that way, which silently stopped every
 * unpaid order from being auto-cancelled.
 *
 * The check compares the element count of the dispatched array literal against
 * the destructuring count of each listener registered for that event name in
 * `crmeb/app/event.php`. Dispatches whose payload is not an array literal (a
 * variable or a function call) are skipped, as are listeners that read the event
 * as a whole instead of destructuring it.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');

/** listener class -> number of values its `handle()` unpacks. */
const unpackCounts = new Map();
const listenerFiles = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.php')) listenerFiles.push(full);
  }
})(path.join(root, 'crmeb/app/listener'));

for (const file of listenerFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const declaration = source.match(/class\s+(\w+)/);
  if (!declaration) continue;
  // `[$a, $b] = $event;` — count the top-level elements only.
  const unpack = source.match(/\$event\s*;/) && source.match(/\[([^\]]*)\]\s*=\s*\$event\s*;/);
  if (!unpack) continue;
  const names = unpack[1].split(',').map((part) => part.trim()).filter(Boolean);
  unpackCounts.set(declaration[1], names.length);
}

/** Registered event name -> listener class short names. */
const listeners = new Map();
{
  const source = fs.readFileSync(path.join(root, 'crmeb/app/event.php'), 'utf8');
  for (const match of source.matchAll(/^\s*'([\w-]+)'\s*=>\s*\[([\s\S]*?)\]/gm)) {
    const names = [...match[2].matchAll(/(\w+)::class/g)].map((entry) => entry[1]);
    if (names.length) listeners.set(match[1], names);
  }
}
assert(listeners.size >= 10, `only ${listeners.size} event listeners were parsed`);

/** Top-level element count of an array literal, or null when it is not one. */
function literalSize(expression) {
  const trimmed = expression.trim();
  if (!trimmed.startsWith('[')) return null;
  let depth = 0;
  let elements = 0;
  let started = false;
  let quote = null;
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      if (depth === 1 && !started) { started = true; elements += 1; }
      continue;
    }
    if (ch === '[' || ch === '(' || ch === '{') {
      depth += 1;
      if (depth === 2 && !started) { started = true; elements += 1; }   // nested array/closure as one element
      continue;
    }
    if (ch === ']' || ch === ')' || ch === '}') {
      depth -= 1;
      if (depth === 1 && ch === ']') started = false;
      if (depth === 0) return elements;
      continue;
    }
    if (depth !== 1) continue;
    if (ch === ',') { started = false; continue; }
    if (!/\s/.test(ch) && !started) { started = true; elements += 1; }
  }
  return null;
}

/** Dispatch sites: `event('Name', PAYLOAD)` with a balanced second argument. */
function dispatches(source) {
  const out = [];
  for (const match of source.matchAll(/\bevent\(\s*'([\w-]+)'\s*,/g)) {
    let depth = 0;
    let quote = null;
    let start = match.index + match[0].length;
    let i = start;
    for (; i < source.length; i += 1) {
      const ch = source[i];
      if (quote) {
        if (ch === '\\') i += 1;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === "'" || ch === '"') { quote = ch; continue; }
      if (ch === '[' || ch === '(' || ch === '{') depth += 1;
      else if (ch === ']' || ch === ')' || ch === '}') {
        if (depth === 0) break;
        depth -= 1;
        if (depth === 0) { i += 1; break; }
      }
    }
    out.push({ name: match[1], payload: source.slice(start, i), index: match.index });
  }
  return out;
}

const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'vendor') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.php')) files.push(full);
  }
})(path.join(root, 'crmeb/app'));

const failures = [];
let checked = 0;
for (const file of files) {
  const relative = path.relative(root, file).split(path.sep).join('/');
  const source = fs.readFileSync(file, 'utf8');
  for (const dispatch of dispatches(source)) {
    const registered = listeners.get(dispatch.name);
    if (!registered) continue;
    const size = literalSize(dispatch.payload);
    if (size === null) continue;
    for (const listener of registered) {
      const expected = unpackCounts.get(listener);
      if (expected === undefined) continue;
      checked += 1;
      if (size >= expected) continue;
      const line = source.slice(0, dispatch.index).split('\n').length;
      failures.push(`${relative}:${line} event('${dispatch.name}') passes ${size} value(s), ${listener} reads ${expected}`);
    }
  }
}

/**
 * Payload mismatches this guard detects and that the fix commit following it
 * resolves. Keeping them listed lets the guard land green; the resolved check
 * below refuses to let an entry outlive the defect it describes.
 */
const PENDING_FIX = [
  "crmeb/app/services/order/StoreOrderCreateServices.php:290 event('OrderCreateAfterListener') passes 5 value(s), OrderCreateAfterListener reads 7",
  "crmeb/app/services/user/LoginServices.php:154 event('UserRegisterListener') passes 4 value(s), RegisterListener reads 5",
  "crmeb/app/services/user/UserServices.php:137 event('UserRegisterListener') passes 4 value(s), RegisterListener reads 5",
];

const regressions = failures.filter((entry) => !PENDING_FIX.includes(entry));
const resolved = PENDING_FIX.filter((entry) => !failures.includes(entry));
assert.deepStrictEqual(resolved, [], 'These baselined payloads now match — delete them from PENDING_FIX:\n' + resolved.join('\n'));
assert(checked >= 15, `only ${checked} dispatch/listener pairs were compared`);
assert.deepStrictEqual(regressions, [], 'Event payloads shorter than their listeners:\n' + regressions.join('\n'));
console.log(`Event payloads checked: ${checked} dispatch/listener pairs across ${unpackCounts.size} listeners (${PENDING_FIX.length} baselined).`);
