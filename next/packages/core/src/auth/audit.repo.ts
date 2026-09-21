import type { DbOrTx } from '@shop/db';
import { auditLogs } from '@shop/db/schema/auth';

/** The only file that touches `audit_logs`. */

export interface AuditEntry {
  adminId: number | null;
  adminAccount: string;
  routeId: string;
  method: string;
  path: string;
  target?: string | null;
  status: number;
  payload?: unknown;
  requestId: string;
  ip?: string | null;
  now: Date;
}

/** Keys that must never reach the operation log. */
const STRIP = new Set([
  'password',
  'oldPassword',
  'newPassword',
  'passwordHash',
  'token',
  'captchaToken',
  'secret',
  'appSecret',
  'apiV3Key',
  'privateKey',
]);

/** Shallow redaction plus a hard size cap: an audit row is a sentence, not a dump. */
export function redactPayload(payload: unknown, limit = 4000): string | null {
  if (payload === undefined || payload === null) return null;
  let value: unknown = payload;
  if (typeof payload === 'object' && !Array.isArray(payload)) {
    value = Object.fromEntries(
      Object.entries(payload as Record<string, unknown>).map(([key, entry]) =>
        STRIP.has(key) ? [key, '[redacted]'] : [key, entry],
      ),
    );
  }
  try {
    const json = JSON.stringify(value);
    return json.length > limit ? `${json.slice(0, limit)}…` : json;
  } catch {
    return null;
  }
}

export async function insertAudit(db: DbOrTx, entry: AuditEntry): Promise<void> {
  await db.insert(auditLogs).values({
    adminId: entry.adminId,
    adminAccount: entry.adminAccount,
    routeId: entry.routeId,
    method: entry.method,
    path: entry.path.slice(0, 512),
    target: entry.target ?? null,
    status: entry.status,
    payload: redactPayload(entry.payload),
    requestId: entry.requestId,
    ip: entry.ip ?? null,
    createdAt: entry.now,
  });
}
