'use strict';
/**
 * Fail when a DAO eager-loads a relation the model no longer declares.
 *
 * Removing a retired relation from a model but leaving `->with('name')` behind
 * only breaks once the table holds rows: think-orm resolves relations lazily,
 * so an empty order table hides the fault until production data arrives.
 *
 * Both sides are resolved by fully qualified name. Indexing models by their short
 * class name used to let two classes with the same name overwrite each other, and
 * a DAO whose model could not be parsed was skipped silently — a guard that skips
 * the file it cannot read is exactly the guard that misses the defect.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const appDir = path.join(root, 'crmeb/app');

function phpFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) phpFiles(full, out);
    else if (entry.name.endsWith('.php')) out.push(full);
  }
  return out;
}

/** `use` statements of a file: alias -> fully qualified name. */
function imports(source) {
  const table = new Map();
  for (const match of source.matchAll(/^use\s+([\w\\]+)(?:\s+as\s+(\w+))?;/gm)) {
    table.set(match[2] || match[1].split('\\').pop(), match[1]);
  }
  return table;
}

/** Resolve a written class name against a file's imports and namespace. */
function resolveName(name, table, namespace) {
  const clean = name.replace(/^\\/, '');
  const parts = clean.split('\\');
  if (table.has(parts[0])) return [table.get(parts[0]), ...parts.slice(1)].join('\\');
  if (parts.length > 1) return clean;
  return namespace ? namespace + '\\' + clean : clean;
}

/** Model FQN -> declared method names. */
const models = new Map();
for (const file of phpFiles(path.join(appDir, 'model'))) {
  const source = fs.readFileSync(file, 'utf8');
  const declaration = /\bclass\s+(\w+)\s+extends/.exec(source);
  if (!declaration) continue;
  const namespace = (source.match(/^namespace\s+([\w\\]+)\s*;/m) || [null, ''])[1];
  const methods = new Set();
  for (const match of source.matchAll(/(?:public|protected)\s+function\s+(\w+)\s*\(/g)) methods.add(match[1]);
  models.set([namespace, declaration[1]].filter(Boolean).join('\\'), {
    file: path.relative(root, file).split(path.sep).join('/'),
    methods,
  });
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

/** Drop closure bodies so only the relation-name literals remain. */
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
  for (const match of withoutClosures(expression).matchAll(/'([\w]+)'|"([\w]+)"/g)) names.push(match[1] || match[2]);
  return names;
}

const failures = [];
let checked = 0;
for (const file of phpFiles(path.join(appDir, 'dao'))) {
  const relative = path.relative(root, file).split(path.sep).join('/');
  const source = fs.readFileSync(file, 'utf8');
  const bound = /setModel\(\)[^{]*\{\s*return\s+([\\\w]+)::class/.exec(source);
  if (!bound) continue;   // abstract bases and DAOs without a single model
  const namespace = (source.match(/^namespace\s+([\w\\]+)\s*;/m) || [null, ''])[1];
  const fqn = resolveName(bound[1], imports(source), namespace);
  const model = models.get(fqn);
  if (!model) throw new Error(`${relative}: cannot resolve model ${fqn} from setModel()`);
  for (const call of source.matchAll(/->with\(/g)) {
    const line = source.slice(0, call.index).split('\n').length;
    const expression = callArguments(source, call.index + '->with'.length);
    for (const name of relationNames(expression)) {
      checked += 1;
      if (model.methods.has(name)) continue;
      failures.push(`${relative}:${line} eager-loads '${name}', missing on ${fqn} (${model.file})`);
    }
  }
}

assert(checked > 0, 'no eager-loaded relations were found; the extractor is broken');
assert.deepStrictEqual(failures, [], 'DAO relations without a model definition:\n' + failures.join('\n'));
console.log(`Model relations checked: ${models.size} models, ${checked} eager loads, no stale relations.`);
