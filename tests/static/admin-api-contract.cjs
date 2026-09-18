'use strict';
/**
 * Every URL the admin frontend can reach must resolve to a registered adminapi route.
 *
 * The comparison is segment-exact: a route may only cover a call when it consumes
 * the same number of path segments (placeholders count as exactly one segment).
 * Prefix matching used to accept `order/completely_made_up` because `order/list`
 * shares its first segment, which hid the routes that a feature removal broke.
 *
 * Only URL literals that a live component can actually reach are checked: the
 * helper functions in `src/api/*.js` are attributed to the name each caller
 * imports, so a dead exported helper no longer pollutes the result.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const srcDir = path.join(root, 'template/admin/src');

/** URL literals that never reach the adminapi router. */
const NON_API = [
  /^$/,            // empty placeholder
  /^https?:/,      // absolute links
  /^\/pages\//,    // storefront page path
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

/**
 * Turn a `url:` expression into a path pattern. Template holes and concatenated
 * variables each become one placeholder: `'diy/info/' + id + '/' + type` and
 * `` `diy/info/${id}/${type}` `` both yield `diy/info/:param/:param`.
 */
function urlPattern(expression) {
  const parts = expression.replace(/,\s*$/, '').split(/\s*\+\s*/);
  const segments = [];
  for (const part of parts) {
    const literal = part.match(/^(`[^`]*`|'[^']*'|"[^"]*")$/);
    if (literal) {
      let value = literal[1].slice(1, -1);
      value = value.replace(/\$\{[^}]*\}/g, ':param');
      if (value) segments.push(value);
    } else if (part.trim() !== '') {
      segments.push(':param');
    }
  }
  return segments.join('/');
}

/** Every `url:` expression in a source file, in source order. */
function urlLiterals(source) {
  const out = [];
  for (const match of source.matchAll(/url:\s*([^\n,]+)/g)) out.push(urlPattern(match[1]));
  return out;
}

const sourceFiles = walk(srcDir);

/** URL literals of every `export function` in `src/api/*.js`, keyed by name. */
const apiFunctions = new Map();   // '@api/app:wechatMenuApi' -> { module, urls }
for (const file of sourceFiles) {
  const relative = path.relative(srcDir, file).split(path.sep).join('/');
  if (!/^api\/[^/]+\.js$/.test(relative)) continue;
  const module = '@/' + relative.replace(/\.js$/, '');
  const source = fs.readFileSync(file, 'utf8');
  const declaration = /export\s+function\s+(\w+)\s*\([^)]*\)\s*\{/g;
  let match;
  while ((match = declaration.exec(source))) {
    let depth = 0;
    let end = match.index + match[0].length - 1;
    for (; end < source.length; end += 1) {
      if (source[end] === '{') depth += 1;
      else if (source[end] === '}') { depth -= 1; if (depth === 0) break; }
    }
    const body = source.slice(match.index, end);
    const urls = urlLiterals(body);
    apiFunctions.set(`${module}:${match[1]}`, { module, file: relative, urls });
  }
}

/** `module:name` pairs each component imports, so unused helpers are skipped. */
const imported = new Set();
for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const statement of source.matchAll(/import\s+\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/g)) {
    const module = statement[2].replace(/\.js$/, '');
    for (const entry of statement[1].split(',')) {
      const name = entry.trim().split(/\s+as\s+/)[0].trim();
      if (name) imported.add(`${module}:${name}`);
    }
  }
}

const calls = new Map();   // url -> where it is called from
for (const [key, fn] of apiFunctions) {
  if (!imported.has(key)) continue;
  for (const url of fn.urls) if (!calls.has(url.trim())) calls.set(url.trim(), key);
}
for (const file of sourceFiles) {
  const relative = path.relative(root, file).split(path.sep).join('/');
  if (/template\/admin\/src\/api\//.test(relative)) continue;
  const source = fs.readFileSync(file, 'utf8');
  for (const url of urlLiterals(source)) {
    if (!calls.has(url)) calls.set(url, relative);
  }
}

/** Path segments of a route definition; `[x]` marks an optional segment. */
function splitSegments(pathLike) {
  const segments = [];
  for (const part of pathLike.split(/(\[[^\]]*\])/).filter((item) => item !== '' && item !== '/')) {
    const optional = part.startsWith('[');
    const inner = part.replace(/^\[|\]$/g, '');
    for (const segment of inner.split('/')) {
      if (!segment) continue;
      segments.push({ value: segment.replace(/:\w+\??/g, ':param'), optional });
    }
  }
  return segments;
}

/** Flatten the adminapi route files into the patterns they register. */
function registeredRoutes() {
  const routes = [];
  const dir = path.join(root, 'crmeb/app/adminapi/route');
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.php'))) {
    const relative = path.relative(root, path.join(dir, file));
    const source = fs.readFileSync(path.join(dir, file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    const stack = [];
    let depth = 0;
    for (const chunk of source.split('\n')) {
      const group = chunk.match(/Route::group\(\s*['"]([^'"]+)['"]/);
      if (group) stack.push({ prefix: group[1], depth });
      const verb = chunk.match(/Route::(get|post|put|delete|patch|resource|any|rule)\(\s*['"]([^'"]*)['"]\s*,\s*['"]([^'"]+)['"]/);
      if (verb) {
        const prefix = stack.map((entry) => entry.prefix).filter(Boolean).join('/');
        const full = [prefix, verb[2]].filter((part) => part !== '' && part !== undefined).join('/');
        if (verb[1] === 'resource') {
          // ThinkPHP resource routes: index, create, read, edit, update, delete.
          for (const suffix of ['', '/create', '/:param', '/:param/edit']) {
            routes.push({ pattern: splitSegments(full + suffix), file: relative, definition: verb[2] + suffix });
          }
        } else {
          routes.push({ pattern: splitSegments(full), file: relative, definition: full });
        }
      }
      depth += (chunk.match(/\{/g) || []).length - (chunk.match(/\}/g) || []).length;
      while (stack.length && depth < stack[stack.length - 1].depth + 1) stack.pop();
    }
  }
  return routes;
}

function matches(pattern, segments) {
  const walk = (i, j) => {
    if (i === pattern.length) return j === segments.length;
    const { value, optional } = pattern[i];
    if (optional && walk(i + 1, j)) return true;
    if (j < segments.length && (value === ':param' || value === segments[j])) return walk(i + 1, j + 1);
    return false;
  };
  return walk(0, 0);
}

const routes = registeredRoutes();
assert(routes.length > 100, `route table looks empty (${routes.length})`);
// A shrinking call set means the extractor stopped seeing the frontend, not that
// the frontend stopped calling the backend.
assert(calls.size >= 400, `only ${calls.size} admin call paths were discovered`);

/**
 * Calls that were already unmatched before the retired-feature work and that a
 * later cleanup phase owns. The list is compared exactly: an entry that starts
 * resolving fails the check until it is deleted, and a new unmatched call is
 * reported as a defect rather than quietly baselined.
 */
const PRE_EXISTING = [
  '@/api/app:wechatTagListApi -> app/wechat/tag',
  '@/api/app:wechatTagCreateApi -> app/wechat/tag/create',
  '@/api/app:wechatTagEditApi -> app/wechat/tag/:param/edit',
  '@/api/app:wechatGroupListApi -> app/wechat/group',
  '@/api/app:wechatGroupCreateApi -> app/wechat/group/create',
  '@/api/app:wechatGroupEditApi -> app/wechat/group/:param/edit',
  '@/api/app:wechatActionListApi -> app/wechat/action',
  'template/admin/src/components/linkaddress/index.vue -> diy/del_link/:param',
  'template/admin/src/pages/app/wechat/user/tag.vue -> app/wechat/tag/:param',
  'template/admin/src/pages/app/wechat/user/tag.vue -> app/wechat/group/:param',
  'template/admin/src/pages/marketing/storeCouponIssue/index.vue -> marketing/coupon/status/:param',
];

const missing = [];
for (const [url, where] of calls) {
  if (NON_API.some((re) => re.test(url))) continue;
  const pathOnly = url.split('?')[0];
  const segments = pathOnly.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean).map((s) => s.replace(/:\w+\??/g, ':param'));
  // A variable in the first segment means the base path is runtime data, not an
  // endpoint: `url: data.url` or a host built from a config value.
  if (!segments.length || segments[0] === ':param') continue;
  if (!routes.some((route) => matches(route.pattern, segments))) missing.push(`${where} -> ${url}`);
}

const regressions = missing.filter((entry) => !PRE_EXISTING.includes(entry));
const resolved = PRE_EXISTING.filter((entry) => !missing.includes(entry));
assert.deepStrictEqual(resolved, [], 'These baselined calls now resolve — delete them from PRE_EXISTING:\n' + resolved.join('\n'));
assert.deepStrictEqual(regressions, [], 'Admin API calls without a registered route:\n' + regressions.join('\n'));
console.log(`Admin API contract checked: ${calls.size} call paths against ${routes.length} registered routes (${PRE_EXISTING.length} baselined).`);
