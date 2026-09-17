'use strict';
/**
 * Every URL the admin frontend calls must resolve to a registered adminapi route.
 * This replaces the old "retired endpoint is unreachable" blacklist with a正向 check.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');

// url properties that feed a router, a storefront link or an upload widget
const NON_API = [
  /^data\.url$/,          // tableDelApi posts a caller-supplied url
  /^\/pages\//,           // storefront page path
  /^\/kefu\//,            // retired storefront chat path
  /^$/,                    // empty placeholder
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|vue)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Collect the admin URL literals used by the frontend. */
const calls = new Map();
for (const file of walk(path.join(root, 'template/admin/src'))) {
  const source = fs.readFileSync(file, 'utf8');
  const matches = source.matchAll(/url:\s*(`[^`]+`|'[^']+'|"[^"]+")/g);
  for (const match of matches) {
    let url = match[1].slice(1, -1);
    if (NON_API.some((re) => re.test(url))) continue;
    // `${...}` becomes a path placeholder
    url = url.replace(/\$\{[^}]*\}/g, ':param').trim();
    if (!url || url.startsWith('http') || url.startsWith('://')) continue;
    url = url.replace(/^\/+/, '');
    if (!calls.has(url)) calls.set(url, path.relative(root, file));
  }
}

/** Flatten a route file into the concrete URL prefixes it registers. */
function registeredRoutes() {
  const groups = [];   // [{ prefix, file }]
  const routes = [];   // { pattern, file }
  const dir = path.join(root, 'crmeb/app/adminapi/route');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.php'))) {
    const full = path.join(dir, file);
    const source = fs.readFileSync(full, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    const relative = path.relative(root, full);
    // track nested Route::group('name') prefixes by brace depth
    const stack = [];
    let depth = 0;
    const tokens = source.split(/(?=Route::group|Route::(?:get|post|put|delete|resource|any|rule)\()/);
    let consumed = 0;
    const linePrefix = () => stack.map((s) => s.prefix).filter(Boolean).join('/');
    for (const chunk of source.split('\n')) {
      const groupMatch = chunk.match(/Route::group\(\s*'([^']+)'/);
      if (groupMatch) stack.push({ prefix: groupMatch[1], depth });
      const routeMatch = chunk.match(/Route::(get|post|put|delete|resource|any|rule)\(\s*'([^']*)'\s*,\s*'([^']+)'/);
      if (routeMatch) {
        const name = routeMatch[2].replace(/\/?:\w+\??/g, ':param').replace(/\/+$/, '');
        if (routeMatch[1] === 'resource') {
          routes.push({ pattern: joinPrefix(linePrefix(), name) + '/:param', file: relative });
          routes.push({ pattern: joinPrefix(linePrefix(), name), file: relative });
        } else {
          routes.push({ pattern: joinPrefix(linePrefix(), name), file: relative });
        }
      }
      depth += (chunk.match(/\{/g) || []).length - (chunk.match(/\}/g) || []).length;
      while (stack.length && depth < stack[stack.length - 1].depth + 1) stack.pop();
    }
  }
  return routes;
}

function joinPrefix(prefix, name) {
  return [prefix, name].filter((part) => part !== '' && part !== undefined).join('/').replace(/\/+/g, '/');
}

const routes = registeredRoutes();
assert(routes.length > 100, `route table looks empty (${routes.length})`);

/** Match a call URL against the registered patterns, tolerating query strings and placeholders. */
function matches(url) {
  const clean = url.split('?')[0].replace(/^\/+/, '');
  const segments = clean.split('/').filter(Boolean);
  return routes.some(({ pattern }) => {
    const parts = pattern.split('/').filter(Boolean);
    if (parts.length > segments.length) return false;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.startsWith(':param') || part.includes(':')) continue;
      if (part !== segments[i]) return false;
    }
    return true;
  });
}

const missing = [];
for (const [url, file] of calls) {
  if (!matches(url)) missing.push(`${file} -> ${url}`);
}

assert.deepStrictEqual(missing, [], 'Admin API calls without a registered route:\n' + missing.join('\n'));
console.log(`Admin API contract checked: ${calls.size} call paths against ${routes.length} registered routes.`);
