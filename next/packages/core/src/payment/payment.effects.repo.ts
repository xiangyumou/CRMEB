import type { DbOrTx } from '@shop/db';
import { effects } from '@shop/db/schema/system';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { allOf, conditionalUpdate, type ConditionalUpdateResult } from '../kernel/tx';

/**
 * The read side of the "需人工处理" console.
 *
 * The `effects` table is platform-owned and `effects/effects.repo.ts` gives the
 * dispatcher exactly what it needs: claim, settle, and an unpaginated
 * `listByStatus` for a debug screen. The operator console needs a filtered,
 * paginated list and a "run this one now" button, so those two queries live
 * here, in the domain that ships the screen, rather than growing the platform
 * repo from a stream that does not own it. CR-4-c asks for them upstream; if it
 * is accepted this file becomes a re-export.
 *
 * Scope is always constrained by the caller to the money-related scopes, so one
 * domain's console cannot quietly become everybody's.
 */

export interface EffectConsoleRow {
  id: number;
  scope: string;
  scopeId: string;
  eventType: string;
  status: string;
  attempts: number;
  lastError: string | null;
  nextRunAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface EffectListFilter {
  scopes: readonly string[];
  status: string;
  scope?: string;
  eventType?: string;
  offset: number;
  limit: number;
}

const columns = {
  id: effects.id,
  scope: effects.scope,
  scopeId: effects.scopeId,
  eventType: effects.eventType,
  status: effects.status,
  attempts: effects.attempts,
  lastError: effects.lastError,
  nextRunAt: effects.nextRunAt,
  createdAt: effects.createdAt,
  updatedAt: effects.updatedAt,
} as const;

export async function listEffects(
  db: DbOrTx,
  filter: EffectListFilter,
): Promise<{ rows: EffectConsoleRow[]; total: number }> {
  const where = allOf(
    inArray(effects.scope, filter.scope ? [filter.scope] : [...filter.scopes]),
    eq(effects.status, filter.status),
    filter.eventType === undefined ? undefined : eq(effects.eventType, filter.eventType),
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

  return { rows: rows as EffectConsoleRow[], total: count?.total ?? 0 };
}

export async function findEffectById(
  db: DbOrTx,
  id: number,
  scopes: readonly string[],
): Promise<(EffectConsoleRow & { payload: unknown }) | null> {
  const rows = await db
    .select({ ...columns, payload: effects.payload })
    .from(effects)
    .where(and(eq(effects.id, id), inArray(effects.scope, [...scopes])))
    .limit(1);
  return (rows[0] as (EffectConsoleRow & { payload: unknown }) | undefined) ?? null;
}

/**
 * Hands a parked row back to the dispatcher.
 *
 * `unknown → pending` with `next_run_at = now`, which is all a retry is: the
 * operator does not run the handler inside their HTTP request, because a
 * handler that calls WeChat has no business being on a request thread. The
 * guard on `status = 'unknown'` stops two operators un-parking the same row
 * twice and stops a retry racing a dispatcher that already holds it.
 */
export async function requeueEffect(
  db: DbOrTx,
  id: number,
  now: Date,
): Promise<ConditionalUpdateResult> {
  return conditionalUpdate(db, effects, {
    where: and(eq(effects.id, id), eq(effects.status, 'unknown')),
    set: { status: 'pending', nextRunAt: now, updatedAt: now },
  });
}
