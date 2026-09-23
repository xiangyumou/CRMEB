#!/usr/bin/env node
//
// Regenerates `tests/fixtures/contract-examples.json`: the first example of every
// storefront (`/api/v1/…`) route, keyed by `METHOD path`.
//
// The mapper tests use it as their input fixture, so a mapper is always tested against
// a payload the contract itself claims is valid. Re-run it after `pnpm gen` at the repository root.
//
//   node scripts/dump-contract-examples.mjs
//
// `openapi.json` drops `examples`, so this reads `src/routes.gen.ts` through the
// contracts package's own tsx.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '..');
const CONTRACTS = path.resolve(APP, '../../packages/contracts');
const TSX = path.join(CONTRACTS, 'node_modules/.bin/tsx');
const OUT = path.join(APP, 'tests/fixtures/contract-examples.json');

if (!fs.existsSync(TSX)) {
  console.error(`tsx not found at ${TSX} — run \`pnpm install\` at the repository root first.`);
  process.exit(2);
}

const script = path.join(CONTRACTS, '.dump-examples.tmp.ts');
fs.writeFileSync(
  script,
  `import { allRoutes as routes } from './src/routes.gen.ts';
const out: Record<string, unknown> = {};
for (const r of routes as any[]) {
  if (!String(r.path).startsWith('/api/v1/')) continue;
  const list = (r.examples ?? []) as any[];
  if (!list.length) continue;
  out[\`\${String(r.method).toUpperCase()} \${r.path}\`] = list[0];
}
console.log(JSON.stringify(out, null, 2));
`,
);

try {
  const json = execFileSync(TSX, [script], { cwd: CONTRACTS, encoding: 'utf8', maxBuffer: 64 << 20 });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, json);
  const routes = Object.keys(JSON.parse(json)).length;
  console.log(`wrote ${path.relative(APP, OUT)} — ${routes} storefront routes with examples`);
} finally {
  fs.rmSync(script, { force: true });
}
