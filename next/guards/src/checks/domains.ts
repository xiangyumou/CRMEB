import fs from 'node:fs';
import path from 'node:path';
import { DOMAIN_NAMES } from '@shop/core/domains';
import { defineCheck, fail, pending, result, type Finding } from '../framework';
import { INSTALLED_DOMAINS } from '../lib/install-domains';
import { nextRoot } from '../lib/paths';

/**
 * CR-8-c said: a domain registers at import, or through one exported
 * `register<Domain>Domain()`, and `domains.gen.ts` is the one place that does
 * it. This check is what keeps that true when a bundler disagrees.
 *
 * `domains.gen.ts` reaches the side-effect-only domains with
 * `import * as diy from './diy/index'` and never reads `diy`. esbuild removes an
 * unused namespace import — so `apps/worker`'s tsup bundle contains six of the
 * twelve domain indexes, and `pnpm guards` under tsx saw the same six until this
 * package started importing them by name. Vitest (oxc) and Next (SWC) keep them,
 * which is why every test passes and the bundle is still wrong.
 *
 * Until CR-1-k lands, the check reports it as pending and asserts the guards'
 * own explicit list still covers every declared domain.
 */

export const domains = defineCheck(
  'domains',
  'every domain in the generated bucket is really installed',
  () => {
    const findings: Finding[] = [];
    const declared = [...DOMAIN_NAMES].sort();
    const installed = [...INSTALLED_DOMAINS].sort();

    for (const name of declared) {
      if (!installed.includes(name)) {
        findings.push(
          fail(
            'guards/src/lib/install-domains.ts',
            `does not import @shop/core/${name}, which domains.gen.ts declares — the guards would run on a half-installed system`,
          ),
        );
      }
    }
    for (const name of installed) {
      if (!declared.includes(name)) {
        findings.push(
          fail(
            'guards/src/lib/install-domains.ts',
            `imports @shop/core/${name}, which is not a domain any more`,
          ),
        );
      }
    }

    const genFile = path.join(nextRoot, 'packages/core/src/domains.gen.ts');
    const gen = fs.existsSync(genFile) ? fs.readFileSync(genFile, 'utf8') : '';
    const namespaceOnly = [...gen.matchAll(/import \* as (\w+) from '\.\/(\w+)\/index';/g)]
      .map((m) => ({ binding: m[1] ?? '', domain: m[2] ?? '' }))
      .filter((entry) => !new RegExp(`\\b${entry.binding}\\.`).test(gen));

    if (namespaceOnly.length > 0) {
      findings.push(
        pending(
          'packages/core/src/domains.gen.ts',
          'orchestrator',
          `${namespaceOnly.length} domains (${namespaceOnly.map((e) => e.domain).join(', ')}) are installed only by an unused namespace import, which esbuild elides — CR-1-k asks gen-config-groups.ts to emit a bare \`import './<d>/index';\` as well`,
        ),
      );
    }

    return result(
      'domains',
      'domain installation',
      `${declared.length} declared domains, ${installed.length} imported by name`,
      findings,
    );
  },
);
