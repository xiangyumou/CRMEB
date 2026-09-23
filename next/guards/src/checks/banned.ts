import path from 'node:path';
import { shopConfig } from '@shop/config/eslint';
import { defineCheck, fail, result, type Finding } from '../framework';
import { isScript, isTypeScript, lineOf, walk } from '../lib/files';
import { nextRoot, rel } from '../lib/paths';

/**
 * Constructs that may not appear, and the one lint rule that must stay on.
 *
 * ESLint already forbids `eval`, `new Function` and the ambient clock in core.
 * A guard repeats the ban for two reasons: lint is configuration and can be
 * turned off in a single line, and lint does not see `.vue` or the uni-app
 * tree. So the rule set is asserted *and* the source is read.
 */

interface Ban {
  id: string;
  pattern: RegExp;
  message: string;
  /** Roots to scan, relative to `next/`. */
  roots: string[];
  /** Paths (repo-relative) allowed to contain it, with the reason in the name. */
  allow?: RegExp[];
}

const APP_ROOTS = [
  'apps/web/src',
  'apps/web/app',
  'apps/worker/src',
  'packages/core/src',
  'packages/contracts/src',
];

const BANS: readonly Ban[] = [
  {
    id: 'eval',
    pattern: /(^|[^.\w])eval\s*\(/,
    message: 'eval() is banned',
    roots: APP_ROOTS,
  },
  {
    id: 'new-function',
    pattern: /new\s+Function\s*\(/,
    message: 'new Function() is banned',
    roots: APP_ROOTS,
  },
  {
    id: 'child-process',
    pattern: /['"]node:child_process['"]|require\(\s*['"]child_process['"]/,
    message: 'child_process outside scripts/ is banned',
    roots: APP_ROOTS,
    // The ban keeps a shell out of anything an HTTP request can reach; a
    // package's own build scripts are not on that path.
    allow: [/\/scripts\//],
  },
  {
    id: 'dangerously-set-inner-html',
    pattern: /dangerouslySetInnerHTML/,
    message: 'raw HTML injection is allowed only in the sanitised rich-text renderer',
    roots: ['apps/web/src', 'apps/web/app'],
    // The one sanitised renderer, named so the exception is auditable.
    allow: [/\/kit\/(rich-text|form\/rich-text)/, /\/admin\/diy\/preview\//],
  },
];

/**
 * A raw `fetch()` of a URL the caller supplied is SSRF. The vetted fetcher is
 * `core/storage/safe-fetch.ts` (STOR-004/005/006), which takes its transport by
 * reference (`options.transport ?? pinnedTransport()`, `node:http`/`https` to
 * the judged address) and so never *calls* `fetch(` by name. Everything else may only fetch a URL it built itself from
 * configuration or a constant host, and each file that does is named here.
 *
 * A call is `fetch(` or `globalThis.fetch(` / `window.fetch(` / `self.fetch(`:
 * the qualified forms are the same global, and the logistics port reached the
 * network through `globalThis.fetch` without the rule ever seeing it.
 *
 * Exactly compared: an entry that no scanned file with a fetch call matches
 * fails until it is deleted. Entries name files, never directories: a
 * directory would let the next file in it call anything.
 */
const FETCH_ALLOW: ReadonlyArray<{ path: RegExp; why: string }> = [
  {
    path: /^next\/packages\/core\/src\/wechat\/wechat\.client\.ts$/,
    why: 'api.weixin.qq.com, built from the wechat config group',
  },
  {
    path: /^next\/packages\/core\/src\/wechat\/wechat\.pay\.ts$/,
    why: 'api.mch.weixin.qq.com: `new URL(args.urlPath, config.apiBaseUrl)`',
  },
  {
    path: /^next\/packages\/core\/src\/shipping\/shipping\.logistics\.port\.ts$/,
    why: 'a hardcoded 阿里云云市场 host (`ALIYUN_HOST`); only the credential is configurable',
  },
  {
    path: /^next\/apps\/web\/src\/admin\/api\/config\.ts$/,
    why: "the browser client's transport: same-origin, route-derived URLs",
  },
  { path: /\.test\.tsx?$/, why: 'tests stub the transport' },
  {
    path: /^next\/apps\/web\/app\/admin\/\(shell\)\/dev\/kit\/mock-fetch\.ts$/,
    why: "the kit demo's in-memory router, which implements fetch rather than calling it",
  },
];

/** `fetch(` and its global-object spellings, but not `cfg.fetch(` or `x.refetch(`. */
const FETCH_CALL = /(^|[^.\w])(?:(?:globalThis|window|self)\s*\.\s*)?fetch\s*\(/g;

export const bannedConstructs = defineCheck(
  'banned',
  'eval, new Function, child_process, raw fetch, dangerouslySetInnerHTML',
  () => {
    const findings: Finding[] = [];
    let scanned = 0;

    for (const ban of BANS) {
      for (const root of ban.roots) {
        for (const file of walk(path.join(nextRoot, root), isScript)) {
          const where = rel(file.file);
          if (where.startsWith('next/guards/')) continue;
          if (ban.allow?.some((re) => re.test(where))) continue;
          const match = ban.pattern.exec(file.text);
          if (match) {
            findings.push(
              fail(`${where}:${lineOf(file.text, match.index)}`, `${ban.message} (${ban.id})`),
            );
          }
        }
      }
    }

    const allowHit = new Set<number>();
    for (const root of APP_ROOTS) {
      for (const file of walk(path.join(nextRoot, root), isTypeScript)) {
        const where = rel(file.file);
        scanned += 1;
        const calls = [...file.text.matchAll(FETCH_CALL)];
        if (calls.length === 0) continue;
        const allowed = FETCH_ALLOW.findIndex((entry) => entry.path.test(where));
        if (allowed >= 0) {
          allowHit.add(allowed);
          continue;
        }
        for (const match of calls) {
          findings.push(
            fail(
              `${where}:${lineOf(file.text, match.index)}`,
              'calls fetch() directly — a remote URL goes through core/storage/safe-fetch.ts',
            ),
          );
        }
      }
    }

    for (const [index, entry] of FETCH_ALLOW.entries()) {
      if (allowHit.has(index)) continue;
      findings.push(
        fail(
          `FETCH_ALLOW ${entry.path.source}`,
          `allows a fetch() call no scanned file makes any more — delete the entry (${entry.why})`,
        ),
      );
    }

    findings.push(...assertClockRuleIsOn());

    return result(
      'banned',
      'banned constructs',
      `${BANS.length} construct bans plus the fetch rule over ${scanned} files (${FETCH_ALLOW.length} allowed callers); the core clock lint rule asserted from @shop/config/eslint`,
      findings,
    );
  },
);

/**
 * `Date.now()` and `new Date()` are banned in core (`docs/conventions.md`,
 * "Time"): the clock is `ctx.clock`, so a test can control it. That is
 * a lint rule, so the guard asserts the rule *exists and is an error* rather
 * than re-implementing it — a rule silently downgraded to `warn` is exactly the
 * failure this catches.
 */
function assertClockRuleIsOn(): Finding[] {
  const findings: Finding[] = [];
  const configs = shopConfig({ kind: 'core' }) as Array<{
    rules?: Record<string, unknown>;
  }>;
  const serialised = JSON.stringify(configs.map((c) => c.rules ?? {}));
  if (!/"no-restricted-properties":\["error"/.test(serialised) || !/"Date"/.test(serialised)) {
    findings.push(
      fail(
        'next/packages/config/eslint/index.js',
        'the core preset no longer bans Date.now() as an error — core reads the clock through ctx.clock',
      ),
    );
  }
  if (!/NewExpression\[callee\.name='Date'\]\[arguments\.length=0\]/.test(serialised)) {
    findings.push(
      fail(
        'next/packages/config/eslint/index.js',
        'the core preset no longer bans a zero-argument new Date() — core reads the clock through ctx.clock',
      ),
    );
  }
  if (!/"no-new-func":"error"/.test(serialised) || !/"no-eval":"error"/.test(serialised)) {
    findings.push(
      fail('next/packages/config/eslint/index.js', 'no-eval / no-new-func are no longer errors'),
    );
  }
  return findings;
}
