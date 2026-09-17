'use strict';
/**
 * Fail when a DAO eager-loads a relation the model no longer declares.
 *
 * Removing a retired relation from a model but leaving `->with('name')` behind
 * only breaks once the table holds rows: think-orm resolves relations lazily,
 * so an empty order table hides the fault until production data arrives.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const appDir = path.join(root, 'crmeb/app');

/** Names the ORM silently ignores; they were never relations. */
const IGNORED = new Set(['getProduct']);

function phpFiles(dir) {
  const out = [];
  (function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.php')) out.push(full);
    }
  })(dir);
  return out;
}

/** Model class name -> declared method names. */
const models = new Map();
for (const file of phpFiles(path.join(appDir, 'model'))) {
  const source = fs.readFileSync(file, 'utf8');
  const cls = /\bclass\s+(\w+)\s+extends/.exec(source);
  if (!cls) continue;
  const methods = new Set();
  for (const m of source.matchAll(/(?:public|protected)\s+function\s+(\w+)\s*\(/g)) methods.add(m[1]);
  models.set(cls[1], { file: path.relative(root, file), methods });
}

/** Text inside the parentheses that open at `open`. */
function callArguments(source, open) {
  let depth = 0;
  let quote = null;
  let out = '';
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') { i += 1; continue; }
      if (ch === quote) quote = null;
      out += ch;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; out += ch; continue; }
    if (ch === '(') {
      depth += 1;
      if (depth === 1) continue;
    } else if (ch === ')') {
      depth -= 1;
      if (depth === 0) break;
    }
    if (depth >= 1) out += ch;
  }
  return out;
}

/** Drop closure bodies so only the relation-name literals and keys remain. */
function withoutClosures(expression) {
  let out = '';
  let i = 0;
  while (i < expression.length) {
    const fn = /\bfunction\b/.exec(expression.slice(i));
    if (!fn) { out += expression.slice(i); break; }
    const start = i + fn.index;
    out += expression.slice(i, start);
    const brace = expression.indexOf('{', start);
    if (brace === -1) break;
    let depth = 0;
    let quote = null;
    let j = brace;
    for (; j < expression.length; j += 1) {
      const ch = expression[j];
      if (quote) {
        if (ch === '\\') { j += 1; continue; }
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === "'" || ch === '"') { quote = ch; continue; }
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    i = j + 1;
  }
  return out;
}

function relationNames(expression) {
  const names = [];
  for (const m of withoutClosures(expression).matchAll(/'([\w]+)'|"([\w]+)"/g)) names.push(m[1] || m[2]);
  return names;
}

const failures = [];
for (const file of phpFiles(path.join(appDir, 'dao'))) {
  const relative = path.relative(root, file).split(path.sep).join('/');
  const source = fs.readFileSync(file, 'utf8');
  const bound = /setModel\(\)[^{]*\{\s*return\s+([\\\w]+)::class/.exec(source);
  if (!bound) continue;
  const model = bound[1].split('\\').pop();
  const declared = models.get(model);
  if (!declared) continue;
  for (const call of source.matchAll(/->with\(/g)) {
    const line = source.slice(0, call.index).split('\n').length;
    const expression = callArguments(source, call.index + '->with'.length);
    for (const name of relationNames(expression)) {
      if (IGNORED.has(name) || declared.methods.has(name)) continue;
      failures.push(`${relative}:${line} eager-loads '${name}', missing on ${model} (${declared.file})`);
    }
  }
}

assert.deepStrictEqual(failures, [], 'DAO relations without a model definition:\n' + failures.join('\n'));
console.log(`Model relations checked: ${models.size} models, no stale eager loads.`);
