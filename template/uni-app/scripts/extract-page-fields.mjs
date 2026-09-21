#!/usr/bin/env node
/**
 * extract-page-fields.mjs — stream H (uni-app API layer).
 *
 * Walks every page / component / lib / mixin / store / subpackage file, resolves
 * what each one imports from `api/*.js`, finds the call sites of those imports and
 * records the property paths the caller reads off the resolved (and rejected) value.
 *
 * The result is both the checklist for re-pointing `api/*.js` and the oracle stream I
 * writes its storefront assertions against: if a legacy mapper stops producing one of
 * the paths listed here, a page breaks.
 *
 * Usage:  node scripts/extract-page-fields.mjs [--json] [--check]
 *   (no flag)  rewrite scripts/reports/page-fields.{json,md}
 *   --json     print the JSON report to stdout, write nothing
 *   --check    fail (exit 1) when the committed report is stale
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_ROOTS = [
  'pages',
  'components',
  'libs',
  'mixins',
  'store',
  'utils',
  'subpackage',
  'plugin',
  'api',
  'App.vue',
  'main.js',
];
const REPORT_DIR = join(ROOT, 'scripts', 'reports');

/* ------------------------------------------------------------------ files */

function walk(entry, out = []) {
  const abs = join(ROOT, entry);
  if (!existsSync(abs)) return out;
  const st = statSync(abs);
  if (st.isFile()) {
    if (/\.(vue|js)$/.test(abs)) out.push(abs);
    return out;
  }
  for (const name of readdirSync(abs)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    walk(join(entry, name), out);
  }
  return out;
}

function sourceFiles() {
  const out = [];
  for (const r of SCAN_ROOTS) walk(r, out);
  return out.sort();
}

/* ---------------------------------------------------------------- imports */

const API_SPEC = /(?:^|[^\w])['"]([^'"]*\bapi\/[A-Za-z_][\w-]*(?:\.js)?)['"]/;

/** `@/api/order.js`, `../../api/order`, `@/api/order.js` → `order` (or null) */
function apiModuleOf(spec) {
  const m = /(?:^|\/)api\/([A-Za-z_][\w-]*)(?:\.js)?$/.exec(spec);
  return m ? m[1] : null;
}

/**
 * Returns Map<localAlias, {module, exported}> for one file.
 * Handles: `import { a, b as c } from '@/api/x.js'` (multi-line) and
 *          `import * as ns from '@/api/x.js'`.
 */
function collectImports(src) {
  const aliases = new Map();
  const namespaces = new Map();
  const re = /import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) {
    const clause = m[1];
    const mod = apiModuleOf(m[2]);
    if (!mod) continue;
    const ns = /^\*\s+as\s+([\w$]+)$/.exec(clause.trim());
    if (ns) {
      namespaces.set(ns[1], mod);
      continue;
    }
    const braces = /\{([\s\S]*?)\}/.exec(clause);
    if (!braces) continue;
    for (const raw of braces[1].split(',')) {
      const part = raw.replace(/\/\/.*$/gm, '').trim();
      if (!part) continue;
      const as = /^([\w$]+)\s+as\s+([\w$]+)$/.exec(part);
      if (as) aliases.set(as[2], { module: mod, exported: as[1] });
      else if (/^[\w$]+$/.test(part)) aliases.set(part, { module: mod, exported: part });
    }
  }
  return { aliases, namespaces };
}

/* ------------------------------------------------------ balanced scanning */

/** index just past the `)` that closes the `(` at `open` */
function matchParen(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const c = src[i];
    if (c === '(') depth += 1;
    else if (c === ')') {
      depth -= 1;
      if (depth === 0) return i + 1;
    } else if (c === '"' || c === "'" || c === '`') {
      i = skipString(src, i);
    }
  }
  return -1;
}

function skipString(src, start) {
  const quote = src[start];
  for (let i = start + 1; i < src.length; i += 1) {
    if (src[i] === '\\') {
      i += 1;
      continue;
    }
    if (src[i] === quote) return i;
  }
  return src.length;
}

const HANDLER_HEAD = [
  // .then(res => …) / .then((res) => …) / .then(async (res) => …)
  /^\s*\.\s*(then|catch)\s*\(\s*(?:async\s+)?\(?\s*([\w$]+)\s*\)?\s*=>/,
  // .then(function (res) { … })
  /^\s*\.\s*(then|catch)\s*\(\s*(?:async\s+)?function\s*\*?\s*[\w$]*\s*\(\s*([\w$]+)/,
];

/** Property paths read off `name` inside `region`. */
function pathsOf(region, name) {
  const out = new Set();
  const re = new RegExp(`\\b${name}\\s*\\.\\s*([A-Za-z_$][\\w$]*(?:\\s*\\.\\s*[A-Za-z_$][\\w$]*)*)`, 'g');
  let m;
  while ((m = re.exec(region))) out.add(m[1].replace(/\s+/g, ''));
  // res.data[i].foo / res.data["k"] — record the bracket step so mappers keep arrays arrays
  const br = new RegExp(`\\b${name}((?:\\s*\\.\\s*[A-Za-z_$][\\w$]*)*)\\s*\\[`, 'g');
  while ((m = br.exec(region))) {
    const p = m[1].replace(/[\s.]/g, '.').replace(/^\./, '');
    if (p) out.add(`${p}[]`);
  }
  // destructuring: const { data, msg } = res
  const de = new RegExp(`\\{([^{}]*)\\}\\s*=\\s*${name}\\b`, 'g');
  while ((m = de.exec(region))) {
    for (const part of m[1].split(',')) {
      const key = part.split(':')[0].trim();
      if (/^[\w$]+$/.test(key)) out.add(key);
    }
  }
  return out;
}

/**
 * Scan one call site and return { resolved:Set, rejected:Set, awaited:boolean }.
 * `callStart` is the index of the alias, `afterArgs` the index past the closing `)`.
 */
function scanCall(src, callStart, afterArgs) {
  const resolved = new Set();
  const rejected = new Set();
  let cursor = afterArgs;
  let sawHandler = false;

  // chained .then(...).catch(...)
  for (let guard = 0; guard < 6; guard += 1) {
    const tail = src.slice(cursor, cursor + 200);
    let head = null;
    for (const re of HANDLER_HEAD) {
      const m = re.exec(tail);
      if (m) {
        head = m;
        break;
      }
    }
    if (!head) break;
    sawHandler = true;
    const kind = head[1];
    const param = head[2];
    const open = src.indexOf('(', cursor + tail.indexOf('.'));
    const close = matchParen(src, open);
    if (close < 0) break;
    const body = src.slice(open, close);
    for (const p of pathsOf(body, param)) (kind === 'then' ? resolved : rejected).add(p);
    cursor = close;
  }

  if (sawHandler) return { resolved, rejected, awaited: false };

  // `const res = await fn(...)` / `let { data } = await fn(...)`
  const before = src.slice(Math.max(0, callStart - 120), callStart);
  const assign = /(?:const|let|var)\s+([\w$]+)\s*=\s*(?:await\s+)?$/.exec(before);
  const destructure = /(?:const|let|var)\s*\{([^{}]*)\}\s*=\s*(?:await\s+)?$/.exec(before);
  if (destructure) {
    for (const part of destructure[1].split(',')) {
      const key = part.split(':')[0].trim();
      if (/^[\w$]+$/.test(key)) resolved.add(key);
    }
    return { resolved, rejected, awaited: true };
  }
  if (assign) {
    const region = src.slice(afterArgs, afterArgs + 2500);
    for (const p of pathsOf(region, assign[1])) resolved.add(p);
    return { resolved, rejected, awaited: true };
  }
  return { resolved, rejected, awaited: false };
}

/* ------------------------------------------------------------------ build */

function build() {
  const files = sourceFiles();
  /** module → fn → { callSites:[], resolved:Set, rejected:Set } */
  const usage = new Map();

  const record = (module, fn) => {
    if (!usage.has(module)) usage.set(module, new Map());
    const mod = usage.get(module);
    if (!mod.has(fn)) mod.set(fn, { callSites: [], resolved: new Set(), rejected: new Set() });
    return mod.get(fn);
  };

  for (const abs of files) {
    const src = readFileSync(abs, 'utf8');
    const rel = relative(ROOT, abs);
    const selfModule = rel.startsWith(`api${'/'}`) ? basename(rel, '.js') : null;
    const { aliases, namespaces } = collectImports(src);
    if (!aliases.size && !namespaces.size) continue;

    for (const [alias, target] of aliases) {
      // an api module re-exporting/importing itself is not a page call site
      if (selfModule && target.module === selfModule) continue;
      const re = new RegExp(`(^|[^\\w$.])${alias}\\s*\\(`, 'g');
      let m;
      while ((m = re.exec(src))) {
        const callStart = m.index + m[1].length;
        const open = callStart + alias.length + (src.slice(callStart + alias.length).match(/^\s*/) || [''])[0].length;
        const after = matchParen(src, open);
        if (after < 0) continue;
        const entry = record(target.module, target.exported);
        const line = src.slice(0, callStart).split('\n').length;
        entry.callSites.push(`${rel}:${line}`);
        const { resolved, rejected } = scanCall(src, callStart, after);
        for (const p of resolved) entry.resolved.add(p);
        for (const p of rejected) entry.rejected.add(p);
        re.lastIndex = after;
      }
    }

    for (const [ns, module] of namespaces) {
      const re = new RegExp(`\\b${ns}\\s*\\.\\s*([\\w$]+)\\s*\\(`, 'g');
      let m;
      while ((m = re.exec(src))) {
        const entry = record(module, m[1]);
        const line = src.slice(0, m.index).split('\n').length;
        entry.callSites.push(`${rel}:${line}`);
        const open = src.indexOf('(', m.index + m[0].length - 1);
        const after = matchParen(src, open);
        if (after < 0) continue;
        const { resolved, rejected } = scanCall(src, m.index, after);
        for (const p of resolved) entry.resolved.add(p);
        for (const p of rejected) entry.rejected.add(p);
      }
    }
  }
  return usage;
}

/* ----------------------------------------------------------- api inventory */

function apiExports() {
  const out = new Map();
  for (const abs of walk('api')) {
    if (!abs.endsWith('.js')) continue;
    const mod = basename(abs, '.js');
    const src = readFileSync(abs, 'utf8');
    const names = new Set();
    const re = /export\s+function\s+([\w$]+)/g;
    let m;
    while ((m = re.exec(src))) names.add(m[1]);
    out.set(mod, names);
  }
  return out;
}

/* ----------------------------------------------------------------- report */

function toJson(usage, inventory) {
  const modules = {};
  for (const mod of [...inventory.keys()].sort()) {
    const exported = [...inventory.get(mod)].sort();
    const used = usage.get(mod) || new Map();
    const fns = {};
    for (const name of exported) {
      const e = used.get(name);
      fns[name] = {
        live: Boolean(e && e.callSites.length),
        callSites: e ? [...new Set(e.callSites)].sort() : [],
        resolvedFields: e ? [...e.resolved].sort() : [],
        rejectedFields: e ? [...e.rejected].sort() : [],
      };
    }
    // functions called but not exported by this module any more (deleted exports still referenced)
    const orphans = [...used.keys()].filter((n) => !inventory.get(mod).has(n)).sort();
    modules[mod] = {
      exports: exported.length,
      live: exported.filter((n) => fns[n].live).length,
      dead: exported.filter((n) => !fns[n].live).length,
      danglingCallSites: Object.fromEntries(
        orphans.map((n) => [n, [...new Set(used.get(n).callSites)].sort()]),
      ),
      functions: fns,
    };
  }
  const totals = Object.values(modules).reduce(
    (a, m) => ({ exports: a.exports + m.exports, live: a.live + m.live, dead: a.dead + m.dead }),
    { exports: 0, live: 0, dead: 0 },
  );
  return { generatedBy: 'scripts/extract-page-fields.mjs', totals, modules };
}

function toMarkdown(report) {
  const L = [];
  L.push('# uni-app API field report');
  L.push('');
  L.push('Generated by `scripts/extract-page-fields.mjs` — do not edit by hand.');
  L.push('');
  L.push(
    'For every export of `api/*.js`: whether a page still calls it, where, and which property paths the caller',
    'reads off the resolved value (`resolved`) and off the rejection (`rejected`). `resolved` is the contract the',
    "legacy mappers in `api/mappers/` must keep producing; `res.data.*` is the payload, `res.msg` the envelope's message.",
  );
  L.push('');
  L.push(`**Totals** — ${report.totals.exports} exports, ${report.totals.live} live, ${report.totals.dead} unreferenced.`);
  L.push('');
  L.push('| module | exports | live | unreferenced |');
  L.push('| --- | ---: | ---: | ---: |');
  for (const [mod, m] of Object.entries(report.modules)) {
    L.push(`| \`${mod}.js\` | ${m.exports} | ${m.live} | ${m.dead} |`);
  }
  L.push('');
  for (const [mod, m] of Object.entries(report.modules)) {
    L.push(`## \`api/${mod}.js\``);
    L.push('');
    const dangling = Object.keys(m.danglingCallSites);
    if (dangling.length) {
      L.push('> Call sites referencing names this module no longer exports:');
      for (const n of dangling) L.push(`> - \`${n}\` — ${m.danglingCallSites[n].join(', ')}`);
      L.push('');
    }
    const live = Object.entries(m.functions).filter(([, f]) => f.live);
    const dead = Object.entries(m.functions).filter(([, f]) => !f.live);
    if (live.length) {
      L.push('| function | call sites | resolved fields | rejected fields |');
      L.push('| --- | --- | --- | --- |');
      for (const [name, f] of live) {
        const sites = f.callSites.length > 4
          ? `${f.callSites.slice(0, 4).map((s) => `\`${s}\``).join('<br>')}<br>_+${f.callSites.length - 4} more_`
          : f.callSites.map((s) => `\`${s}\``).join('<br>');
        const fields = f.resolvedFields.length ? f.resolvedFields.map((s) => `\`${s}\``).join(' ') : '_(result unused)_';
        const rej = f.rejectedFields.length ? f.rejectedFields.map((s) => `\`${s}\``).join(' ') : '—';
        L.push(`| \`${name}\` | ${sites} | ${fields} | ${rej} |`);
      }
      L.push('');
    }
    if (dead.length) {
      L.push(`Unreferenced (${dead.length}): ${dead.map(([n]) => `\`${n}\``).join(', ')}`);
      L.push('');
    }
  }
  return `${L.join('\n')}\n`;
}

/* ------------------------------------------------------------------- main */

const args = process.argv.slice(2);
const report = toJson(build(), apiExports());

if (args.includes('--json')) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else if (args.includes('--check')) {
  const p = join(REPORT_DIR, 'page-fields.json');
  const current = existsSync(p) ? readFileSync(p, 'utf8') : '';
  if (current !== `${JSON.stringify(report, null, 2)}\n`) {
    process.stderr.write('page-fields report is stale — run `node scripts/extract-page-fields.mjs`\n');
    process.exit(1);
  }
  process.stdout.write('page-fields report is up to date\n');
} else {
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(join(REPORT_DIR, 'page-fields.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(REPORT_DIR, 'page-fields.md'), toMarkdown(report));
  process.stdout.write(
    `wrote scripts/reports/page-fields.{json,md} — ${report.totals.exports} exports, ${report.totals.live} live, ${report.totals.dead} unreferenced\n`,
  );
}
