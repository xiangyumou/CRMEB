/**
 * `pnpm guards` — the static half of stream K.
 *
 * Runs every check, prints one line per check plus every finding, and exits 1
 * if anything failed. Pending findings (work owned by a stream still in flight)
 * are printed and counted but never fatal; the second hardening pass runs the
 * same command with every stream merged, when a pending finding becomes a
 * failure by itself.
 *
 *   pnpm guards                 every check
 *   pnpm guards contracts       one or more checks by name
 *   pnpm guards --json          machine-readable, for CI annotations
 *   pnpm guards --quiet         only the summary and the failures
 */
import { adminClient } from './checks/admin-client';
import { bannedConstructs } from './checks/banned';
import { contractsAndRoutes } from './checks/contracts';
import { domains } from './checks/domains';
import { invariants } from './checks/invariants';
import { permissions } from './checks/permissions';
import { retiredFeatures } from './checks/retired';
import { routeHygiene } from './checks/route-hygiene';
import { secretsNeverLeak } from './checks/secrets';
import { txPool } from './checks/tx-pool';
import { uniappCalls } from './checks/uniapp';
import { count, settle, type Check, type CheckResult } from './framework';
import { inFlight, isMerged } from './lib/streams';

const CHECKS: readonly Check[] = [
  domains,
  contractsAndRoutes,
  routeHygiene,
  permissions,
  adminClient,
  uniappCalls,
  retiredFeatures,
  bannedConstructs,
  secretsNeverLeak,
  txPool,
  invariants,
];

const args = process.argv.slice(2);
const json = args.includes('--json');
const quiet = args.includes('--quiet');
const selected = args.filter((a) => !a.startsWith('--'));

const chosen =
  selected.length === 0 ? CHECKS : CHECKS.filter((check) => selected.includes(check.name));

if (chosen.length === 0) {
  console.error(`no such check: ${selected.join(', ')}`);
  console.error(`known: ${CHECKS.map((c) => c.name).join(', ')}`);
  process.exit(2);
}

const results: CheckResult[] = [];
for (const check of chosen) {
  results.push(settle(await check.run(), isMerged));
}

const failures = results.reduce((n, r) => n + count(r.findings, 'fail'), 0);
const pendings = results.reduce((n, r) => n + count(r.findings, 'pending'), 0);

if (json) {
  console.log(JSON.stringify({ results, failures, pending: pendings }, null, 2));
} else {
  for (const check of results) {
    const failed = count(check.findings, 'fail');
    const mark = failed > 0 ? 'FAIL' : 'ok  ';
    console.log(`${mark} ${check.name.padEnd(14)} ${check.summary}`);
    for (const finding of check.findings) {
      if (quiet && finding.level !== 'fail') continue;
      const tag =
        finding.level === 'fail'
          ? '  ✗'
          : finding.level === 'pending'
            ? `  · pending(${finding.stream ?? '?'})`
            : '  ·';
      console.log(`${tag} ${finding.where}: ${finding.message}`);
    }
  }
  console.log('');
  const byStream = new Map<string, number>();
  for (const check of results) {
    for (const finding of check.findings) {
      if (finding.level !== 'pending') continue;
      const stream = finding.stream ?? '?';
      byStream.set(stream, (byStream.get(stream) ?? 0) + 1);
    }
  }
  const owed = [...byStream.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([stream, n]) => `${stream}=${n}`)
    .join(', ');
  console.log(
    `${results.length} checks, ${failures} failure(s), ${pendings} pending${owed ? ` (${owed})` : ''}; in flight: ${inFlight().join(', ') || 'none'}`,
  );
}

process.exit(failures > 0 ? 1 : 0);
