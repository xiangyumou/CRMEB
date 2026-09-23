import fs from 'node:fs';
import path from 'node:path';
import { allRoutes } from '@shop/contracts/routes';
import { diyComponentSchemas } from '@shop/contracts/diy/schema/registry';
import { defineCheck, fail, result, type Finding } from '../framework';
import { walk } from '../lib/files';
import { rel, uniApp } from '../lib/paths';
import { shapeOf } from '../lib/route-files';
import {
  RESOLVE_SUFFIXES,
  TARGETS,
  exportedStringList,
  extractCalls,
  importsOf,
  isLocal,
  preprocess,
  scriptOf,
  type UniCall,
} from '../lib/uniapp';

/**
 * The uni-app, read against the rest of the tree.
 *
 * 1. **Every storefront call resolves.** Each `request.<verb>('…')` in `api/*.js`
 *    names a method and a `/api/v1` path that a contract describes. A call with
 *    no contract is a screen that fails at runtime, and a retired word in the
 *    URL is a feature the shop does not have coming back through the client.
 *    The uni-app carries the same assertion as a script of its own
 *    (`scripts/check-api-routes.mjs`, against `openapi.json`); this copy runs in
 *    `pnpm guards` against the in-memory registry.
 *
 * 2. **The app is whole, for both targets.** Every page `pages.json` registers
 *    (main package and sub-packages) has its `.vue` file, and every local import
 *    (`./`, `../`, `@/`) resolves to a file — checked once per target after
 *    conditional compilation, because a missing module inside an `#ifdef
 *    MP-WEIXIN` block breaks the mini-program build and nothing else.
 *
 * 3. **The DIY renderer knows the components the editor saves.** The uni-app's
 *    registry (`utils/diyRegistry.js`) is the contracts' `diyComponentSchemas`,
 *    minus the components the page renderer never draws (`NOT_RENDERED_BY_PAGE`),
 *    and every `item.name == '…'` branch of the renderer names a registered
 *    component. A component the editor saves and the phone does not know is a
 *    hole in the page.
 */

/** A retired word in a storefront URL is a feature coming back through the client. */
const RETIRED_TOKENS = [
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
 * Components the editor saves that the page renderer deliberately does not
 * draw, each with where it is drawn instead. Exactly compared: an entry that
 * is no longer a contract component, or that the uni-app registry now lists,
 * fails until it is deleted.
 */
const NOT_RENDERED_BY_PAGE: Readonly<Record<string, string>> = {
  bottomMenu: 'the product-detail footer, drawn by productBottom.vue rather than by pageDesign.vue',
};

const DIY_REGISTRY = 'utils/diyRegistry.js';
const DIY_REGISTRY_EXPORT = 'diyComponentNames';
const DIY_RENDERER = 'subpackage/diyComponents/pageDesign.vue';

function retiredTokenIn(url: string): string | null {
  const tokens = new Set<string>();
  for (const segment of url.split('/')) {
    if (!segment) continue;
    tokens.add(segment);
    for (const part of segment.split('-')) tokens.add(part);
  }
  return RETIRED_TOKENS.find((word) => tokens.has(word)) ?? null;
}

function collectCalls(): UniCall[] {
  const apiDir = path.join(uniApp, 'api');
  if (!fs.existsSync(apiDir)) return [];
  const calls: UniCall[] = [];
  for (const name of fs.readdirSync(apiDir).sort()) {
    if (!name.endsWith('.js')) continue;
    const file = path.join(apiDir, name);
    calls.push(...extractCalls(rel(file), fs.readFileSync(file, 'utf8')));
  }
  // The upload helper builds its URL from `API_PREFIX` rather than from a
  // literal, so it is asserted by hand — it is the one multipart call.
  const util = path.join(uniApp, 'utils/util.js');
  if (fs.existsSync(util) && fs.readFileSync(util, 'utf8').includes('API_PREFIX + "/uploads')) {
    calls.push({ file: rel(util), line: 0, method: 'POST', url: '/api/v1/uploads' });
  }
  return calls;
}

function checkCalls(findings: Finding[]): { calls: number; live: number } {
  const known = new Set(allRoutes.map((r) => `${r.method} ${shapeOf(r.path)}`));
  const calls = collectCalls();
  let live = 0;
  for (const call of calls) {
    const where = `${call.file}:${call.line}`;
    const url = shapeOf((call.url.split('?')[0] ?? '').replace(/\/$/, ''));
    if (!url.startsWith('/api/v1/')) {
      findings.push(fail(where, `${call.method} ${call.url} is not a /api/v1 route`));
      continue;
    }
    const retired = retiredTokenIn(url);
    if (retired) {
      findings.push(
        fail(where, `${call.method} ${call.url} is a URL for the retired feature "${retired}"`),
      );
      continue;
    }
    if (known.has(`${call.method} ${url}`)) {
      live += 1;
      continue;
    }
    findings.push(fail(where, `${call.method} ${url} is described by no contract`));
  }
  return { calls: calls.length, live };
}

interface PagesJson {
  pages?: Array<{ path: string }>;
  subPackages?: Array<{ root: string; pages: Array<{ path: string }> }>;
}

function checkPages(findings: Finding[]): number {
  const file = path.join(uniApp, 'pages.json');
  if (!fs.existsSync(file)) {
    findings.push(fail(rel(file), 'is missing — the uni-app registers no pages'));
    return 0;
  }
  const pages = JSON.parse(fs.readFileSync(file, 'utf8')) as PagesJson;
  const registered = [
    ...(pages.pages ?? []).map((page) => page.path),
    ...(pages.subPackages ?? []).flatMap((group) =>
      group.pages.map((page) => path.posix.join(group.root, page.path)),
    ),
  ];
  for (const page of registered) {
    if (!fs.existsSync(path.join(uniApp, `${page}.vue`))) {
      findings.push(fail(rel(file), `registers ${page}, which has no ${page}.vue`));
    }
  }
  return registered.length;
}

function resolves(from: string, specifier: string): boolean {
  const base = specifier.startsWith('@/')
    ? path.join(uniApp, specifier.slice(2))
    : path.resolve(path.dirname(from), specifier);
  return RESOLVE_SUFFIXES.some((suffix) => {
    const candidate = base + suffix;
    return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
  });
}

function checkImports(findings: Finding[]): number {
  const files = walk(uniApp, (name) => /\.(vue|js)$/.test(name));
  for (const target of TARGETS) {
    for (const file of files) {
      const script = preprocess(scriptOf(file.file, file.text), target);
      for (const specifier of importsOf(script)) {
        if (!isLocal(specifier) || resolves(file.file, specifier)) continue;
        findings.push(
          fail(rel(file.file), `imports ${specifier}, which does not exist (${target})`),
        );
      }
    }
  }
  return files.length;
}

function checkDiyRegistry(findings: Finding[]): number {
  const registryFile = path.join(uniApp, DIY_REGISTRY);
  const rendererFile = path.join(uniApp, DIY_RENDERER);
  const registry = fs.existsSync(registryFile)
    ? exportedStringList(fs.readFileSync(registryFile, 'utf8'), DIY_REGISTRY_EXPORT)
    : null;
  if (registry === null) {
    findings.push(fail(rel(registryFile), `no longer exports ${DIY_REGISTRY_EXPORT}`));
    return 0;
  }
  const where = rel(registryFile);
  const seen = new Set<string>();
  for (const name of registry) {
    if (seen.has(name)) findings.push(fail(where, `lists ${name} twice`));
    seen.add(name);
  }

  const contract = Object.keys(diyComponentSchemas);
  for (const [name, why] of Object.entries(NOT_RENDERED_BY_PAGE)) {
    if (!contract.includes(name)) {
      findings.push(
        fail(
          'NOT_RENDERED_BY_PAGE',
          `${name} is not a contract component any more — delete the entry (${why})`,
        ),
      );
    }
    if (seen.has(name)) {
      findings.push(
        fail(
          'NOT_RENDERED_BY_PAGE',
          `${name} is in the uni-app registry now — delete the entry (${why})`,
        ),
      );
    }
  }
  for (const name of contract) {
    if (!seen.has(name) && !(name in NOT_RENDERED_BY_PAGE)) {
      findings.push(
        fail(where, `does not list ${name}, which the editor saves (diyComponentSchemas)`),
      );
    }
  }
  for (const name of seen) {
    if (!contract.includes(name)) {
      findings.push(fail(where, `lists ${name}, which no contract schema describes`));
    }
  }

  if (!fs.existsSync(rendererFile)) {
    findings.push(fail(rel(rendererFile), 'is missing — nothing renders a DIY page'));
    return registry.length;
  }
  const template = fs.readFileSync(rendererFile, 'utf8');
  for (const match of template.matchAll(/item\.name\s*==\s*['"]([^'"]+)['"]/g)) {
    const name = match[1] ?? '';
    if (!seen.has(name)) {
      findings.push(
        fail(rel(rendererFile), `renders ${name}, which ${DIY_REGISTRY} does not register`),
      );
    }
  }
  return registry.length;
}

export const uniappCalls = defineCheck(
  'uniapp',
  'every storefront call resolves; pages, imports and DIY components are whole',
  () => {
    const findings: Finding[] = [];
    const { calls, live } = checkCalls(findings);
    const pages = checkPages(findings);
    const files = checkImports(findings);
    const components = checkDiyRegistry(findings);
    return result(
      'uniapp',
      'uni-app',
      `${calls} calls (${live} live); ${pages} pages; imports of ${files} files for ${TARGETS.join(' and ')}; ${components} DIY components`,
      findings,
    );
  },
);
