import path from 'node:path';
import { allRoutes } from '@shop/contracts/routes';
import { defineCheck, fail, result, type Finding } from '../framework';
import { walk } from '../lib/files';
import { rel, webApp } from '../lib/paths';
import {
  declaresForceDynamic,
  exportedMethods,
  isMutating,
  namesAuditTarget,
  shapeOf,
  urlOfRouteFile,
} from '../lib/route-files';

/**
 * Two properties every route file must have, and one it must have when it
 * writes.
 *
 * `dynamic = 'force-dynamic'` — an API route that Next decides to prerender
 * answers from a build-time snapshot, which for `/admin-api/*` means serving
 * one admin's data to another.
 *
 * `ctx.audit(target)` — `handle()` writes the audit row for every mutating
 * admin request by itself, but the *target* (which coupon, which order) can
 * only come from the handler. An audit row that records "PUT /admin-api/…/:id"
 * with a null target is a log entry nobody can answer a question with.
 *
 * The exemptions are named one by one with the reason, exactly-compared: a
 * route that starts naming a target must be deleted from the list, so the list
 * cannot quietly become a baseline.
 */

interface Exemption {
  url: string;
  method: string;
  why: string;
  /** Set when the exemption is a defect somebody else owns, not a decision. */
  cr?: string;
  stream?: string;
}

const AUDIT_EXEMPT: readonly Exemption[] = [
  {
    url: '/admin-api/auth/login',
    method: 'POST',
    why: 'auth: public — there is no admin actor yet, so handle() writes no row at all (see AUDIT.md K-SEC-A4)',
  },
  {
    url: '/admin-api/catalog/sku-matrix',
    method: 'POST',
    why: 'a POST-shaped read: the spec axes go in the body and nothing is written',
  },
  {
    url: '/admin-api/attachments/scan-tokens',
    method: 'POST',
    why: 'mints a single-use upload token bound to the caller and writes a row, but names no audit target',
    cr: 'CR-5-k',
    stream: 'F1',
  },

  // The notification inbox: a decision, not a defect.
  {
    url: '/admin-api/notifications/:id/read',
    method: 'POST',
    why: "marks the caller's own inbox item read; the row would say an admin read their own notification, and handle() already records the actor",
  },
  {
    url: '/admin-api/notifications/read-all',
    method: 'POST',
    why: "the same, in bulk: the caller's own inbox, nobody else's object",
  },

  // CR-17-k — seventeen writes that merged with E2 and name no target. Two
  // streams are in flight over this code and each owns its half.
  {
    url: '/admin-api/notification-logs/:id/retry',
    method: 'POST',
    why: 'merged with E2 without an audit target',
    cr: 'CR-17-k',
    stream: 'N1',
  },
  {
    url: '/admin-api/notification-templates/:code',
    method: 'PUT',
    why: 'merged with E2 without an audit target',
    cr: 'CR-17-k',
    stream: 'N1',
  },
  {
    url: '/admin-api/notification-templates/:code/channels/:channel',
    method: 'POST',
    why: 'merged with E2 without an audit target',
    cr: 'CR-17-k',
    stream: 'N1',
  },
  {
    url: '/admin-api/wechat-auto-replies',
    method: 'POST',
    why: 'merged with E2 without an audit target',
    cr: 'CR-17-k',
    stream: 'E3',
  },
  {
    url: '/admin-api/wechat-auto-replies/:id',
    method: 'PUT',
    why: 'merged with E2 without an audit target',
    cr: 'CR-17-k',
    stream: 'E3',
  },
  {
    url: '/admin-api/wechat-auto-replies/:id',
    method: 'DELETE',
    why: 'merged with E2 without an audit target',
    cr: 'CR-17-k',
    stream: 'E3',
  },
  {
    url: '/admin-api/wechat-auto-replies/:id/status',
    method: 'POST',
    why: 'merged with E2 without an audit target',
    cr: 'CR-17-k',
    stream: 'E3',
  },
  {
    url: '/admin-api/wechat-media',
    method: 'POST',
    why: 'merged with E2 without an audit target',
    cr: 'CR-17-k',
    stream: 'E3',
  },
  {
    url: '/admin-api/wechat-media/:id',
    method: 'DELETE',
    why: 'merged with E2 without an audit target',
    cr: 'CR-17-k',
    stream: 'E3',
  },
  {
    url: '/admin-api/wechat-media/sync',
    method: 'POST',
    why: 'merged with E2 without an audit target',
    cr: 'CR-17-k',
    stream: 'E3',
  },
  {
    url: '/admin-api/wechat-menus',
    method: 'POST',
    why: 'merged with E2 without an audit target',
    cr: 'CR-17-k',
    stream: 'E3',
  },
  {
    url: '/admin-api/wechat-menus/:id',
    method: 'PUT',
    why: 'merged with E2 without an audit target',
    cr: 'CR-17-k',
    stream: 'E3',
  },
  {
    url: '/admin-api/wechat-menus/:id',
    method: 'DELETE',
    why: 'merged with E2 without an audit target',
    cr: 'CR-17-k',
    stream: 'E3',
  },
  {
    url: '/admin-api/wechat-menus/:id/publish',
    method: 'POST',
    why: 'merged with E2 without an audit target',
    cr: 'CR-17-k',
    stream: 'E3',
  },
  {
    url: '/admin-api/wechat-qrcode-categories',
    method: 'POST',
    why: 'merged with E2 without an audit target',
    cr: 'CR-17-k',
    stream: 'E3',
  },
  {
    url: '/admin-api/wechat-qrcode-categories/:id',
    method: 'PUT',
    why: 'merged with E2 without an audit target',
    cr: 'CR-17-k',
    stream: 'E3',
  },
  {
    url: '/admin-api/wechat-qrcode-categories/:id',
    method: 'DELETE',
    why: 'merged with E2 without an audit target',
    cr: 'CR-17-k',
    stream: 'E3',
  },
  {
    url: '/admin-api/wechat-qrcodes',
    method: 'POST',
    why: 'merged with E2 without an audit target',
    cr: 'CR-17-k',
    stream: 'E3',
  },
  {
    url: '/admin-api/wechat-qrcodes/:id',
    method: 'PUT',
    why: 'merged with E2 without an audit target',
    cr: 'CR-17-k',
    stream: 'E3',
  },
  {
    url: '/admin-api/wechat-qrcodes/:id',
    method: 'DELETE',
    why: 'merged with E2 without an audit target',
    cr: 'CR-17-k',
    stream: 'E3',
  },
  {
    url: '/admin-api/wechat-qrcodes/:id/status',
    method: 'POST',
    why: 'merged with E2 without an audit target',
    cr: 'CR-17-k',
    stream: 'E3',
  },
];

export const routeHygiene = defineCheck(
  'route-hygiene',
  'force-dynamic on every route, an audit target on every write',
  () => {
    const appDir = path.join(webApp, 'app');
    const files = walk(appDir, (name) => name === 'route.ts').filter(
      (f) => f.relative.startsWith('admin-api/') || f.relative.startsWith('api/'),
    );
    const findings: Finding[] = [];

    // Every mutating route on the admin surface, whatever its auth mode: the
    // login route is `public` and so writes no audit row at all, which is a
    // finding rather than a reason to leave it out of the count.
    const adminWrites = new Map<string, string[]>(); // url shape -> methods
    for (const route of allRoutes) {
      if (!route.path.startsWith('/admin-api/') || !isMutating(route.method)) continue;
      const shape = shapeOf(route.path);
      adminWrites.set(shape, [...(adminWrites.get(shape) ?? []), route.method]);
    }

    const exemptionsHit = new Set<string>();

    for (const file of files) {
      const where = rel(file.file);
      if (!declaresForceDynamic(file.text)) {
        findings.push(fail(where, "does not export dynamic = 'force-dynamic'"));
      }

      const url = urlOfRouteFile(file.relative);
      const shape = shapeOf(url);
      const writes = (adminWrites.get(shape) ?? []).filter((m) =>
        exportedMethods(file.text).includes(m as never),
      );
      if (writes.length === 0) continue;

      const covered: string[] = [];
      for (const method of writes) {
        const exemption = AUDIT_EXEMPT.find((e) => shapeOf(e.url) === shape && e.method === method);
        if (!exemption) continue;
        covered.push(method);
        exemptionsHit.add(`${method} ${shape}`);
        if (exemption.cr) {
          findings.push({
            level: 'pending',
            where,
            stream: exemption.stream ?? '?',
            message: `${method} ${exemption.why} — ${exemption.cr}`,
          });
        }
      }
      const needed = writes.filter((m) => !covered.includes(m));
      if (needed.length > 0 && !namesAuditTarget(file.text)) {
        findings.push(fail(where, `${needed.join('/')} writes but never calls ctx.audit(target)`));
      }
    }

    for (const exemption of AUDIT_EXEMPT) {
      const key = `${exemption.method} ${shapeOf(exemption.url)}`;
      if (!exemptionsHit.has(key)) {
        findings.push(
          fail(
            exemption.url,
            `is on the audit exemption list but is not an admin write any more — delete the entry (${exemption.why})`,
          ),
        );
      }
    }

    return result(
      'route-hygiene',
      'route hygiene',
      `${files.length} route files checked for force-dynamic; ${adminWrites.size} admin write URLs checked for an audit target (${AUDIT_EXEMPT.length} exempt)`,
      findings,
    );
  },
);
