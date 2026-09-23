import type { DbOrTx } from '@shop/db';
import { effects } from '@shop/db/schema/system';
import { and, asc, desc, eq, like, sql } from 'drizzle-orm';
import { allOf, conditionalUpdate, type ConditionalUpdateResult } from '../kernel/tx';

/**
 * The read side of 通知发送记录, over the effects ledger.
 *
 * Every query is pinned to `scope = 'notification'`. One domain's console must
 * not become everybody's — a notification operator has no business seeing a
 * parked refund.
 */

export const NOTIFICATION_SCOPE = 'notification';

export interface NotificationEffectRow {
  id: number;
  scopeId: string;
  status: string;
  attempts: number;
  lastError: string | null;
  payload: unknown;
  nextRunAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const columns = {
  id: effects.id,
  scopeId: effects.scopeId,
  status: effects.status,
  attempts: effects.attempts,
  lastError: effects.lastError,
  payload: effects.payload,
  nextRunAt: effects.nextRunAt,
  createdAt: effects.createdAt,
  updatedAt: effects.updatedAt,
} as const;

export interface NotificationEffectFilter {
  status: string;
  /** Narrows to one registry code. The scope id starts with `<code>:`. */
  code?: string;
  offset: number;
  limit: number;
}

export async function listNotificationEffects(
  db: DbOrTx,
  filter: NotificationEffectFilter,
): Promise<{ rows: NotificationEffectRow[]; total: number }> {
  const where = allOf(
    eq(effects.scope, NOTIFICATION_SCOPE),
    eq(effects.status, filter.status),
    // `scope_id` is `<code>:<subject scope>:<subject id>`, so a prefix match on
    // `code:` is exact for the code and cannot match a different event whose
    // name merely starts the same way.
    filter.code === undefined ? undefined : like(effects.scopeId, `${filter.code}:%`),
  );

  const rows = await db
    .select(columns)
    .from(effects)
    .where(where)
    .orderBy(desc(effects.updatedAt), asc(effects.id))
    .offset(filter.offset)
    .limit(filter.limit);

  const [count] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(effects)
    .where(where);

  return { rows: rows as NotificationEffectRow[], total: count?.total ?? 0 };
}

export async function findNotificationEffect(
  db: DbOrTx,
  id: number,
): Promise<NotificationEffectRow | null> {
  const rows = await db
    .select(columns)
    .from(effects)
    .where(and(eq(effects.id, id), eq(effects.scope, NOTIFICATION_SCOPE)))
    .limit(1);
  return (rows[0] as NotificationEffectRow | undefined) ?? null;
}

/**
 * `unknown → pending` with `next_run_at = now`.
 *
 * The guard on `status = 'unknown'` is what stops two operators un-parking the
 * same row and what stops a retry racing a dispatcher that already holds it.
 * The handler is not run here: it talks to WeChat.
 */
export async function requeueNotificationEffect(
  db: DbOrTx,
  id: number,
  now: Date,
): Promise<ConditionalUpdateResult> {
  return conditionalUpdate(db, effects, {
    where: and(
      eq(effects.id, id),
      eq(effects.scope, NOTIFICATION_SCOPE),
      eq(effects.status, 'unknown'),
    ),
    set: { status: 'pending', nextRunAt: now, updatedAt: now },
  });
}
