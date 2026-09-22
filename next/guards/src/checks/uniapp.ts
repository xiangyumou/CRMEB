import fs from 'node:fs';
import path from 'node:path';
import { allRoutes } from '@shop/contracts/routes';
import { defineCheck, fail, note, pending, result, type Finding } from '../framework';
import { rel, uniApp } from '../lib/paths';
import { shapeOf } from '../lib/route-files';
import { extractCalls, type UniCall } from '../lib/uniapp';
import { MARKER_REASSIGNMENTS, reassignmentFor } from '../lib/marker-reassignments';
import { STREAMS, isMerged } from '../lib/streams';

/**
 * The uni-app half of the contract guard, which fails **both ways**.
 *
 * Forwards: a call with no contract and no marker is broken now.
 * Backwards: a call marked `CONTRACT-PENDING(E1)` whose route has since landed
 * is a stale marker — the allow-list is compared exactly, so it cannot rot into
 * a baseline that quietly hides a regression. That backwards direction is the
 * whole point of running this before E1 / E2 / D / F2 / S merge: the day their
 * contracts land, this guard says which markers to delete.
 *
 * `template/uni-app/` belongs to stream H, so nothing here edits it. H runs the
 * same assertion from its own side (`scripts/check-api-routes.mjs`); this is the
 * copy that runs in `pnpm guards` from `next/`, against the in-memory contract
 * registry rather than against `openapi.json`.
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

function retiredTokenIn(url: string): string | null {
  const tokens = new Set<string>();
  for (const segment of url.split('/')) {
    if (!segment) continue;
    tokens.add(segment);
    for (const part of segment.split('-')) tokens.add(part);
  }
  return RETIRED_TOKENS.find((word) => tokens.has(word)) ?? null;
}

function collect(): UniCall[] {
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
    calls.push({
      file: rel(util),
      line: 0,
      method: 'POST',
      url: '/api/v1/uploads',
      pending: null,
    });
  }
  return calls;
}

export const uniappCalls = defineCheck(
  'uniapp',
  'every storefront call resolves, and no CONTRACT-PENDING marker outlives its route',
  () => {
    const known = new Set(allRoutes.map((r) => `${r.method} ${shapeOf(r.path)}`));
    const calls = collect();
    const findings: Finding[] = [];
    const byStream = new Map<string, number>();
    const reassignmentsHit = new Set<string>();
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
        if (call.pending) {
          findings.push(
            fail(
              where,
              `is marked CONTRACT-PENDING(${call.pending}) but ${call.method} ${url} now exists — delete the marker`,
            ),
          );
        }
        continue;
      }
      if (call.pending) {
        const stream = call.pending.trim();
        const reassigned = reassignmentFor(stream, call.method, url);
        if (reassigned) {
          reassignmentsHit.add(`${reassigned.marked} ${reassigned.method} ${reassigned.url}`);
        }
        const owner = reassigned?.owedBy ?? stream;
        byStream.set(owner, (byStream.get(owner) ?? 0) + 1);
        if (!STREAMS.has(owner)) {
          findings.push(fail(where, `CONTRACT-PENDING(${stream}) names no known stream`));
        } else if (isMerged(owner)) {
          findings.push(
            fail(
              where,
              `CONTRACT-PENDING(${stream}) waits on a stream that has already merged, and ${call.method} ${url} still does not exist`,
            ),
          );
        } else if (reassigned) {
          findings.push(
            pending(
              where,
              owner,
              `${call.method} ${url} is marked CONTRACT-PENDING(${stream}) but ${stream} has merged: ${reassigned.why} moved to ${owner} — CR-6-k asks H to re-point the marker`,
            ),
          );
        } else {
          findings.push(pending(where, stream, `${call.method} ${url} waits on ${stream}`));
        }
        continue;
      }
      findings.push(
        fail(where, `${call.method} ${url} has no contract and no CONTRACT-PENDING marker`),
      );
    }

    // Exactly compared, like every other allow-list here: a reassignment that no
    // longer matches a marked call has been resolved, and the entry must go.
    for (const entry of MARKER_REASSIGNMENTS) {
      const key = `${entry.marked} ${entry.method} ${entry.url}`;
      if (!reassignmentsHit.has(key)) {
        findings.push(
          fail(
            'guards/src/lib/marker-reassignments.ts',
            `${entry.method} ${entry.url} is listed as CONTRACT-PENDING(${entry.marked}) reassigned to ${entry.owedBy}, but no such marked call exists any more — delete the entry`,
          ),
        );
      }
    }

    const pendingTotal = [...byStream.values()].reduce((a, b) => a + b, 0);
    if (pendingTotal > 0) {
      findings.push(
        note(
          'template/uni-app/api',
          `pending by stream: ${[...byStream]
            .sort()
            .map(([s, n]) => `${s}=${n}`)
            .join(' ')}`,
        ),
      );
    }

    return result(
      'uniapp',
      'uni-app API layer',
      `${calls.length} calls: ${live} live, ${pendingTotal} pending`,
      findings,
    );
  },
);
