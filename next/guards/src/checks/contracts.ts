import path from 'node:path';
import { allRoutes, routeSources } from '@shop/contracts/routes';
import { defineCheck, fail, pending, result, type Finding } from '../framework';
import { walk } from '../lib/files';
import { PENDING_IMPLEMENTATIONS, pendingImplementation } from '../lib/pending-implementations';
import { rel, webApp } from '../lib/paths';
import {
  exportedMethods,
  paramsOf,
  shapeOf,
  urlOfRouteFile,
  type Method,
} from '../lib/route-files';

/**
 * ROUTE-001, both ways round.
 *
 * Legacy's version of this guard walked `Route::group` files and asked whether
 * the controller method existed. Here the contract is the registry, the
 * directory is the router, and the two must agree exactly:
 *
 *   - every contract resolves to a `route.ts` that exports its method;
 *   - every exported method of every `route.ts` is described by a contract;
 *   - the folder's parameter name is the contract's parameter name, because
 *     `handle()` feeds `params` straight into the contract's zod schema — a
 *     `[couponId]` folder under a `:id` contract is a 422 on every request.
 */

/**
 * Route files that deliberately have no contract, named one by one.
 *
 * There is exactly one, and it is a real seam rather than an oversight:
 * `defineRoute` describes a request and a response body, and an SSE stream has
 * neither — it has a long-lived `text/event-stream` and a sequence of events.
 * The admin client carries the matching exception in `checks/admin-client.ts`
 * (`HAND_BUILT`), so both ends of the one uncontracted URL are written down in
 * the same two places a reader would look.
 *
 * Listed as `pending`, not as a decision, because the seam is worth closing:
 * either `defineRoute` grows an `sse` kind that describes the event payloads,
 * or the endpoint stays outside the registry for ever and nothing asserts its
 * shape. N1 owns the notification surface while it is in flight.
 */
const UNCONTRACTED: ReadonlyArray<{
  url: string;
  method: Method;
  stream: string;
  why: string;
}> = [
  {
    url: '/admin-api/notifications/stream',
    method: 'GET',
    stream: 'N1',
    why: 'the in-app notification SSE stream — defineRoute cannot describe an event stream, so the URL is outside the registry',
  },
];

interface RouteFile {
  relative: string;
  url: string;
  methods: Method[];
}

export function collectRouteFiles(): RouteFile[] {
  const appDir = path.join(webApp, 'app');
  return walk(appDir, (name) => name === 'route.ts')
    .filter((f) => f.relative.startsWith('admin-api/') || f.relative.startsWith('api/'))
    .map((f) => ({
      relative: rel(f.file),
      url: urlOfRouteFile(f.relative),
      methods: exportedMethods(f.text),
    }));
}

export const contractsAndRoutes = defineCheck(
  'contracts',
  'every contract has a route file and every route file has a contract',
  () => {
    const files = collectRouteFiles();
    const findings: Finding[] = [];

    const byShape = new Map<string, RouteFile>();
    for (const file of files) {
      const shape = shapeOf(file.url);
      const clash = byShape.get(shape);
      if (clash) {
        findings.push(
          fail(file.relative, `two route files claim the same URL shape as ${clash.relative}`),
        );
        continue;
      }
      byShape.set(shape, file);
      if (file.methods.length === 0) {
        findings.push(fail(file.relative, 'exports no HTTP method'));
      }
    }

    const served = new Set<string>();
    const pendingHit = new Set<string>();
    for (const route of allRoutes) {
      const shape = shapeOf(route.path);
      const file = byShape.get(shape);
      if (!file) {
        // A contract that merged ahead of its implementation is the owning
        // stream's work, not a defect — as long as it is named.
        const owed = pendingImplementation(route.id);
        if (owed) {
          pendingHit.add(route.id);
          findings.push(
            pending(
              routeSources[route.id] ?? route.id,
              owed.stream,
              `${route.method} ${route.path} (${owed.why}) has no route file yet`,
            ),
          );
          continue;
        }
        findings.push(
          fail(
            routeSources[route.id] ?? route.id,
            `${route.method} ${route.path} (${route.id}) has no route file — expected ${expectedFile(route.path)}`,
          ),
        );
        continue;
      }
      if (pendingImplementation(route.id)) {
        findings.push(
          fail(
            file.relative,
            `${route.id} is on the pending-implementation list but its route file exists — delete the entry from lib/pending-implementations.ts`,
          ),
        );
      }
      if (!file.methods.includes(route.method as Method)) {
        findings.push(
          fail(file.relative, `does not export ${route.method}, which ${route.id} declares`),
        );
        continue;
      }
      served.add(`${route.method} ${shape}`);

      const contractParams = paramsOf(route.path);
      const fileParams = paramsOf(file.url);
      for (const [i, name] of contractParams.entries()) {
        if (fileParams[i] !== name) {
          findings.push(
            fail(
              file.relative,
              `folder parameter [${fileParams[i] ?? '?'}] does not match the contract's :${name} (${route.id}) — handle() parses params by name`,
            ),
          );
        }
      }
    }

    const uncontractedHit = new Set<string>();
    for (const file of files) {
      for (const method of file.methods) {
        if (served.has(`${method} ${shapeOf(file.url)}`)) continue;
        const known = UNCONTRACTED.find(
          (e) => e.method === method && shapeOf(e.url) === shapeOf(file.url),
        );
        if (known) {
          uncontractedHit.add(`${known.method} ${known.url}`);
          findings.push(
            pending(file.relative, known.stream, `${method} ${file.url} — ${known.why}`),
          );
          continue;
        }
        findings.push(
          fail(file.relative, `exports ${method} ${file.url}, which no contract describes`),
        );
      }
    }

    for (const entry of UNCONTRACTED) {
      if (uncontractedHit.has(`${entry.method} ${entry.url}`)) continue;
      findings.push(
        fail(
          entry.url,
          `is listed as deliberately uncontracted but no route file exports ${entry.method} for it any more — delete the entry`,
        ),
      );
    }

    for (const entry of PENDING_IMPLEMENTATIONS) {
      if (pendingHit.has(entry.id)) continue;
      if (allRoutes.some((route) => route.id === entry.id)) continue;
      findings.push(
        fail(
          entry.id,
          `is on the pending-implementation list but no contract declares it any more — delete the entry from lib/pending-implementations.ts`,
        ),
      );
    }

    const handlers = files.reduce((n, f) => n + f.methods.length, 0);
    return result(
      'contracts',
      'contracts <-> route files',
      `${allRoutes.length} contracts against ${files.length} route files (${handlers} exported handlers)`,
      findings,
    );
  },
);

function expectedFile(contractPath: string): string {
  const segments = contractPath.split('/').filter(Boolean);
  const dirs = segments.map((s) => (s.startsWith(':') ? `[${s.slice(1)}]` : s));
  return `next/apps/web/app/${dirs.join('/')}/route.ts`;
}
