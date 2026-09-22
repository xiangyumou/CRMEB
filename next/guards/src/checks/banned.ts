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
  'packages/etl/src',
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
    // `packages/etl` is an operator CLI, not a request path: `assets.ts`
    // spawns the copy command its own plan built (`plan.command`), with
    // `stdio: 'inherit'`, from a terminal. The ban exists to keep a shell out
    // of anything that can be reached by an HTTP request, and nothing in
    // `apps/` imports the ETL package.
    allow: [/\/scripts\//, /^next\/packages\/etl\/src\/assets\.ts$/],
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
 * `core/storage/safe-fetch.ts` (STOR-004/005/006). Everything else may only
 * fetch a URL it built itself from configuration, which in practice means the
 * WeChat client and the browser-side API client.
 */
const FETCH_ALLOW: readonly RegExp[] = [
  /^next\/packages\/core\/src\/storage\/safe-fetch\.ts$/,
  /^next\/packages\/core\/src\/wechat\//, // api.weixin.qq.com / api.mch.weixin.qq.com, built from config
  /^next\/packages\/core\/src\/wechat-oa\//, // the same, for the official account: `new URL(path, config.apiBaseUrl)`
  /^next\/apps\/web\/src\/admin\/api\//, // the browser client: same-origin, route-derived URLs
  /^next\/apps\/web\/src\/admin\/session\//,
  /\.test\.tsx?$/,
  /\/dev\/kit\//,
];

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

    for (const root of APP_ROOTS) {
      for (const file of walk(path.join(nextRoot, root), isTypeScript)) {
        const where = rel(file.file);
        scanned += 1;
        if (FETCH_ALLOW.some((re) => re.test(where))) continue;
        for (const match of file.text.matchAll(/(^|[^.\w])fetch\s*\(/g)) {
          findings.push(
            fail(
              `${where}:${lineOf(file.text, match.index)}`,
              'calls fetch() directly — a remote URL goes through core/storage/safe-fetch.ts',
            ),
          );
        }
      }
    }

    findings.push(...assertClockRuleIsOn());

    return result(
      'banned',
      'banned constructs',
      `${BANS.length} construct bans plus the fetch rule over ${scanned} files; the core clock lint rule asserted from @shop/config/eslint`,
      findings,
    );
  },
);

/**
 * CONVENTIONS "Time": `Date.now()` and `new Date()` are banned in core. That is
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
        'the core preset no longer bans Date.now() as an error (CONVENTIONS "Time")',
      ),
    );
  }
  if (!/NewExpression\[callee\.name='Date'\]\[arguments\.length=0\]/.test(serialised)) {
    findings.push(
      fail(
        'next/packages/config/eslint/index.js',
        'the core preset no longer bans a zero-argument new Date() (CONVENTIONS "Time")',
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
