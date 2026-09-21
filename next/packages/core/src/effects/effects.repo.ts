import type { DbOrTx, Tx } from '@shop/db';
import { effects, type EffectStatus } from '@shop/db/schema/system';
import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';

/** The only file that touches the `effects` table. */

export interface EffectRow {
  id: number;
  scope: string;
  scopeId: string;
  eventType: string;
  payload: unknown;
  status: string;
  attempts: number;
  nextRunAt: Date;
  lastError: string | null;
}

export async function insertIgnore(
  tx: DbOrTx,
  input: {
    scope: string;
    scopeId: string;
    eventType: string;
    payload: unknown;
    now: Date;
    runAt?: Date;
  },
): Promise<boolean> {
  const rows = await tx
    .insert(effects)
    .values({
      scope: input.scope,
      scopeId: input.scopeId,
      eventType: input.eventType,
      payload: (input.payload ?? {}) as never,
      status: 'pending',
      attempts: 0,
      nextRunAt: input.runAt ?? input.now,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoNothing({
      target: [effects.scope, effects.scopeId, effects.eventType],
    })
    .returning({ id: effects.id });
  return rows.length > 0;
}

/**
 * Claims up to `limit` due rows with `FOR UPDATE SKIP LOCKED` and immediately
 * pushes their `next_run_at` out by the lease, so a second dispatcher neither
 * blocks on them nor picks them up again while the first is still working.
 */
export async function claimDue(
  tx: Tx,
  options: { limit: number; now: Date; leaseMs: number },
): Promise<EffectRow[]> {
  const claimed = await tx
    .select()
    .from(effects)
    .where(and(eq(effects.status, 'pending'), lte(effects.nextRunAt, options.now)))
    .orderBy(asc(effects.nextRunAt), asc(effects.id))
    .limit(options.limit)
    .for('update', { skipLocked: true });

  if (claimed.length === 0) return [];
  const ids = claimed.map((row) => row.id);
  await tx
    .update(effects)
    .set({
      attempts: sql`${effects.attempts} + 1`,
      nextRunAt: new Date(options.now.getTime() + options.leaseMs),
      dispatchedAt: options.now,
      updatedAt: options.now,
    })
    .where(inArray(effects.id, ids));

  return claimed.map((row) => ({
    id: row.id,
    scope: row.scope,
    scopeId: row.scopeId,
    eventType: row.eventType,
    payload: row.payload,
    status: row.status,
    // The caller sees the attempt number it is about to make.
    attempts: row.attempts + 1,
    nextRunAt: row.nextRunAt,
    lastError: row.lastError,
  }));
}

export async function markDone(tx: DbOrTx, id: number, now: Date): Promise<void> {
  await tx
    .update(effects)
    .set({ status: 'done' satisfies EffectStatus, lastError: null, updatedAt: now })
    .where(eq(effects.id, id));
}

export async function scheduleRetry(
  tx: DbOrTx,
  id: number,
  input: { runAt: Date; error: string; now: Date },
): Promise<void> {
  await tx
    .update(effects)
    .set({
      status: 'pending' satisfies EffectStatus,
      nextRunAt: input.runAt,
      lastError: input.error,
      updatedAt: input.now,
    })
    .where(eq(effects.id, id));
}

export async function markUnknown(
  tx: DbOrTx,
  id: number,
  input: { error: string; now: Date },
): Promise<void> {
  await tx
    .update(effects)
    .set({
      status: 'unknown' satisfies EffectStatus,
      lastError: input.error,
      updatedAt: input.now,
    })
    .where(eq(effects.id, id));
}

export async function findOne(
  db: DbOrTx,
  key: { scope: string; scopeId: string; eventType: string },
): Promise<EffectRow | null> {
  const rows = await db
    .select()
    .from(effects)
    .where(
      and(
        eq(effects.scope, key.scope),
        eq(effects.scopeId, key.scopeId),
        eq(effects.eventType, key.eventType),
      ),
    )
    .limit(1);
  const row = rows[0];
  return row ? (row as EffectRow) : null;
}

/** For the admin "stuck effects" screen. */
export async function listByStatus(
  db: DbOrTx,
  status: EffectStatus,
  limit = 100,
): Promise<EffectRow[]> {
  const rows = await db
    .select()
    .from(effects)
    .where(eq(effects.status, status))
    .orderBy(asc(effects.id))
    .limit(limit);
  return rows as EffectRow[];
}
