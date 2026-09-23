#!/usr/bin/env node
/**
 * Size and safety gate for the WeChat build (`dist/weapp`). Run after `build:weapp`:
 *
 *   node scripts/size-report.mjs [--dist dist/weapp] [--main-kb 1536] [--total-kb 8192]
 *                                [--subpackage-kb 2048] [--json]
 *
 * Budgets also come from MINI_BUDGET_MAIN_KB / MINI_BUDGET_TOTAL_KB / MINI_BUDGET_SUBPACKAGE_KB.
 * WeChat's own hard limits are 2 MB for the main package and for each sub-package, and 20 MB in
 * total; the defaults leave headroom (docs/mini/spikes/S1-taro.md).
 *
 * It fails (exit 1) when:
 *
 * - the main package, a sub-package or the total is over budget;
 * - any script contains `new Function(` or `eval(` (WeChat's JSCore on iOS refuses them, and
 *   the review team flags dynamic code);
 * - any script does not parse as ES2018, the target in babel.config.js (the WeChat runtime
 *   does not transpile node_modules for us; `es6: false` in project.config.json);
 * - app.json lists a page or sub-package that is not in the output;
 * - any file carries a 32-hex-digit token (the shape of an AppSecret or a payment key; those live
 *   only in the server's config), or the output holds a miniprogram-ci upload key
 *   (`private.*.key`);
 * - any file carries the e2e suite's H5 emulation (`src/platform/h5-mp-emulation.tsx`: its
 *   `/__e2e/` endpoints or its storage key) or the H5 preview, or the module list includes
 *   `src/platform/runtime.h5.tsx` or either implementation (docs/mini/spikes/S4-e2e.md);
 * - the build's module list (`.bundle-stats/weapp.json`, written by config/bundle-stats.ts) is
 *   missing or older than the build, or shows more than one copy of react, react-dom,
 *   react-reconciler, @tarojs/runtime or TanStack Query, or any zod at all.
 *
 * Package sizes count every file WeChat uploads: everything except source maps and the
 * developer-tool project files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { parse } from 'acorn';

const appRoot = path.resolve(import.meta.dirname, '..');
const KB = 1024;

const { values: args } = parseArgs({
  options: {
    dist: { type: 'string', default: 'dist/weapp' },
    'main-kb': { type: 'string' },
    'total-kb': { type: 'string' },
    'subpackage-kb': { type: 'string' },
    json: { type: 'boolean', default: false },
  },
});

function budget(flag, envName, fallback) {
  const raw = args[flag] ?? process.env[envName];
  if (raw === undefined || raw === '') return fallback * KB;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${flag}: not a size in KB: ${raw}`);
  return value * KB;
}

const budgets = {
  main: budget('main-kb', 'MINI_BUDGET_MAIN_KB', 1536),
  total: budget('total-kb', 'MINI_BUDGET_TOTAL_KB', 8192),
  subpackage: budget('subpackage-kb', 'MINI_BUDGET_SUBPACKAGE_KB', 2048),
};

const dist = path.resolve(appRoot, args.dist);
const failures = [];

if (!fs.existsSync(path.join(dist, 'app.json'))) {
  console.error(
    `size-report: ${path.relative(appRoot, dist)}/app.json not found; run build:weapp first.`,
  );
  process.exit(1);
}

/** Not part of the uploaded package. */
const NOT_UPLOADED = new Set(['project.config.json', 'project.private.config.json']);

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true, recursive: true }).flatMap((entry) => {
    if (!entry.isFile()) return [];
    const rel = path
      .relative(dist, path.join(entry.parentPath, entry.name))
      .split(path.sep)
      .join('/');
    if (rel.endsWith('.map') || NOT_UPLOADED.has(rel)) return [];
    return [{ rel, size: fs.statSync(path.join(dist, rel)).size }];
  });
}

const appJson = JSON.parse(fs.readFileSync(path.join(dist, 'app.json'), 'utf8'));
const subPackages = (appJson.subPackages ?? appJson.subpackages ?? []).map((pkg) => ({
  name: pkg.name ?? pkg.root,
  root: pkg.root.replace(/\/+$/, ''),
  pages: pkg.pages ?? [],
}));

const files = listFiles(dist);
const packages = new Map([['main', { name: 'main', files: 0, bytes: 0 }]]);
for (const pkg of subPackages) packages.set(pkg.root, { name: pkg.name, files: 0, bytes: 0 });

function packageOf(rel) {
  const pkg = subPackages.find((candidate) => rel.startsWith(`${candidate.root}/`));
  return pkg ? pkg.root : 'main';
}

for (const file of files) {
  const entry = packages.get(packageOf(file.rel));
  entry.files += 1;
  entry.bytes += file.size;
}
const total = files.reduce((sum, file) => sum + file.size, 0);

// --- budgets --------------------------------------------------------------------------------
const main = packages.get('main');
if (main.bytes > budgets.main)
  failures.push(`main package ${kb(main.bytes)} > budget ${kb(budgets.main)}`);
for (const [root, entry] of packages) {
  if (root !== 'main' && entry.bytes > budgets.subpackage) {
    failures.push(
      `sub-package ${entry.name} ${kb(entry.bytes)} > budget ${kb(budgets.subpackage)}`,
    );
  }
}
if (total > budgets.total) failures.push(`total ${kb(total)} > budget ${kb(budgets.total)}`);

// --- app.json points at real pages ----------------------------------------------------------
const pageFiles = [
  ...(appJson.pages ?? []),
  ...subPackages.flatMap((pkg) => pkg.pages.map((page) => `${pkg.root}/${page}`)),
];
const present = new Set(files.map((file) => file.rel));
for (const page of pageFiles) {
  for (const ext of ['js', 'json', 'wxml']) {
    if (!present.has(`${page}.${ext}`))
      failures.push(`app.json lists ${page} but ${page}.${ext} is missing`);
  }
}

// --- no test-only code ---------------------------------------------------------------------
// The H5 builds pick their platform in src/platform/runtime.h5.tsx; the WeChat build must not
// contain it or anything behind it, above all the e2e emulation, which settles payments
// through a test harness. Markers are strings the emulation cannot work without.
const TEST_ONLY_MARKERS = ['/__e2e/', '__shop_mp_emulation__', 'h5-mp-emulation', 'h5-preview'];
const TEST_ONLY_MODULES = /\/src\/platform\/(runtime\.h5|h5-mp-emulation|h5-preview)\.tsx?$/;
for (const file of files) {
  if (!/\.(js|json|wxml|wxs)$/.test(file.rel)) continue;
  const source = fs.readFileSync(path.join(dist, file.rel), 'utf8');
  for (const marker of TEST_ONLY_MARKERS) {
    if (source.includes(marker)) failures.push(`${file.rel}: contains test-only "${marker}"`);
  }
}

// --- no secrets -----------------------------------------------------------------------------
// Everything in the package is readable by anyone who opens the mini-program. The `mini` guard
// checks the source for the same shapes; this checks what the build inlined (env vars included).
const SECRET_LIKE = /(?<![0-9A-Za-z])[0-9a-f]{32}(?![0-9A-Za-z])/g;
for (const entry of fs.readdirSync(dist, { withFileTypes: true, recursive: true })) {
  if (!entry.isFile()) continue;
  const rel = path
    .relative(dist, path.join(entry.parentPath, entry.name))
    .split(path.sep)
    .join('/');
  if (/^private\..+\.key$/.test(entry.name)) {
    failures.push(`${rel}: a miniprogram-ci upload key in the build output`);
    continue;
  }
  if (!/\.(js|json|wxml|wxs|wxss)$/.test(rel) || rel.endsWith('.map')) continue;
  const source = fs.readFileSync(path.join(dist, rel), 'utf8');
  for (const match of source.matchAll(SECRET_LIKE)) {
    failures.push(
      `${rel}: a 32-hex-digit token (${match[0].slice(0, 4)}…) at offset ${match.index}, the shape of an AppSecret`,
    );
  }
}

// --- dynamic code and syntax level ----------------------------------------------------------
const DYNAMIC_CODE = [
  { label: 'new Function(', pattern: /\bnew\s+Function\s*\(/g },
  { label: 'eval(', pattern: /(?<![\w$.])eval\s*\(/g },
];
for (const file of files.filter((candidate) => candidate.rel.endsWith('.js'))) {
  const source = fs.readFileSync(path.join(dist, file.rel), 'utf8');
  for (const { label, pattern } of DYNAMIC_CODE) {
    for (const match of source.matchAll(pattern)) {
      const at = match.index ?? 0;
      const context = source.slice(Math.max(0, at - 60), at + 40).replace(/\s+/g, ' ');
      failures.push(`${file.rel}: ${label} at offset ${at}: …${context}…`);
    }
  }
  try {
    parse(source, { ecmaVersion: 2018, sourceType: 'script' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const at = typeof error?.pos === 'number' ? error.pos : 0;
    const context = source.slice(Math.max(0, at - 60), at + 40).replace(/\s+/g, ' ');
    failures.push(
      `${file.rel}: not ES2018 (${message}): …${context}… (add the dependency to compile.include)`,
    );
  }
}

// --- one copy of the runtime ---------------------------------------------------------------
const SINGLE_COPY = [
  'react',
  'react-dom',
  'react-reconciler',
  '@tarojs/runtime',
  '@tanstack/react-query',
  '@tanstack/query-core',
];
const statsFile = path.join(appRoot, '.bundle-stats', 'weapp.json');
let copies;
/** Raw (pre-minification) module bytes per npm package, to explain where the size goes. */
let heaviest;
// The stats are written after the build emits, so stats older than app.json are from an
// earlier build.
const statsFresh =
  fs.existsSync(statsFile) &&
  fs.statSync(statsFile).mtimeMs >= fs.statSync(path.join(dist, 'app.json')).mtimeMs;
if (statsFresh) {
  const { modules } = JSON.parse(fs.readFileSync(statsFile, 'utf8'));
  const dirsByPackage = new Map();
  const bytesByPackage = new Map();
  for (const module of modules) {
    const normalized = module.path.split(path.sep).join('/');
    if (TEST_ONLY_MODULES.test(normalized))
      failures.push(`test-only module in the WeChat build: ${path.relative(appRoot, module.path)}`);
    const match = /^(.*\/node_modules\/((?:@[^/]+\/)?[^/]+))\//.exec(normalized);
    const owner = match ? match[2] : normalized.includes('/packages/') ? '(workspace)' : '(app)';
    bytesByPackage.set(owner, (bytesByPackage.get(owner) ?? 0) + module.size);
    if (!match) continue;
    const [, dir, name] = match;
    if (!dirsByPackage.has(name)) dirsByPackage.set(name, new Set());
    dirsByPackage.get(name).add(dir);
  }
  copies = Object.fromEntries(
    SINGLE_COPY.map((name) => [name, dirsByPackage.get(name)?.size ?? 0]),
  );
  for (const name of SINGLE_COPY) {
    if (copies[name] > 1)
      failures.push(
        `${copies[name]} copies of ${name}: ${[...dirsByPackage.get(name)].join(', ')}`,
      );
  }
  heaviest = [...bytesByPackage].sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (dirsByPackage.has('zod'))
    failures.push('zod is in the bundle (contracts must be imported as types)');
} else {
  failures.push(`${path.relative(appRoot, statsFile)} is missing or older than the build; rebuild`);
}

// --- report ---------------------------------------------------------------------------------
const report = {
  dist: path.relative(appRoot, dist),
  budgets,
  packages: [...packages.values()],
  total,
  copies: copies ?? null,
  heaviest: heaviest ?? null,
  failures,
};

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const rows = [...packages.values()].map((entry) => [
    entry.name,
    String(entry.files),
    kb(entry.bytes),
  ]);
  rows.push(['total', String(files.length), kb(total)]);
  const width = Math.max(...rows.map((row) => row[0].length));
  console.log(
    `size-report ${report.dist}  (budgets: main ${kb(budgets.main)}, sub-package ${kb(budgets.subpackage)}, total ${kb(budgets.total)})`,
  );
  for (const [name, count, size] of rows)
    console.log(`  ${name.padEnd(width)}  ${count.padStart(4)} files  ${size.padStart(10)}`);
  if (copies) {
    console.log(
      `  copies: ${Object.entries(copies)
        .map(([name, n]) => `${name}×${n}`)
        .join(', ')}`,
    );
    const list = heaviest.map(([name, bytes]) => `${name} ${kb(bytes)}`).join(', ');
    console.log(`  heaviest (raw module bytes): ${list}`);
  } else {
    console.log('  copies: not checked');
  }
  for (const failure of failures) console.error(`  FAIL ${failure}`);
  console.log(failures.length ? `size-report: ${failures.length} failure(s)` : 'size-report: ok');
}

process.exit(failures.length ? 1 : 0);

function kb(bytes) {
  return `${(bytes / KB).toFixed(1)} KB`;
}
