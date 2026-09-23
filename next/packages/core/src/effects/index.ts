import type { DbOrTx, Tx } from '@shop/db';
import type { Ctx } from '../kernel/context';
import { withTx } from '../kernel/tx';
import {
  claimDue,
  findById,
  findOne,
  insertIgnore,
  listByStatus,
  listEffects,
  markDone,
  markUnknown,
  oldestDue,
  retryEffect,
  scheduleRetry,
  type EffectConsoleRow,
  type EffectDetailRow,
  type EffectListFilter,
  type EffectRow,
} from './effects.repo';

/**
 * The post-commit side-effect ledger.
 *
 * `docs/conventions.md`: "Anything that calls a third party happens *after*
 * commit, via the effects ledger — never inside the transaction." A domain
 * writes one row in the same transaction as the state change; the dispatcher
 * runs the registered handler after that transaction commits.
 *
 * Why not "just enqueue a job"? Because an enqueue inside a transaction is a
 * lie: the job can start before the commit lands, or the commit can succeed
 * after the enqueue failed. A row in the same transaction cannot do either.
 *
 * Delivery is **at-least-once**. `UNIQUE (scope, scope_id, event_type)` makes
 * *recording* exactly-once and the lease makes concurrent dispatch
 * non-overlapping, but a crash between "handler succeeded" and "marked done"
 * will replay. Handlers must be idempotent. This is written on the wall.
 */

export interface EffectKey {
  /** Aggregate kind: `order`, `refund`, `user`, … */
  scope: string;
  /** Aggregate id as text. Use `String(orderId)` or an `out_trade_no`. */
  scopeId: string;
  /** `order.paid`, `refund.approved`, … */
  eventType: string;
}

export interface EffectInput extends EffectKey {
  payload: unknown;
  /** Delay the first attempt (e.g. a reconciliation check five minutes later). */
  delayMs?: number;
}

export interface Effect extends EffectKey {
  id: number;
  payload: unknown;
  /** 1 on the first run. */
  attempts: number;
}

export type EffectHandler = (ctx: Ctx, effect: Effect) => Promise<void>;

/**
 * Records an effect inside the caller's transaction.
 *
 * `INSERT … ON CONFLICT DO NOTHING`, so calling it twice for the same
 * `(scope, scopeId, eventType)` is free and the caller does not have to check
 * first. Returns whether this call was the one that created the row — useful
 * only for logging; never branch on it for correctness.
 *
 * It takes `ctx` for one reason: `next_run_at` must come from `ctx.clock`, the
 * same clock the dispatcher compares it against. With the ambient `new Date()`
 * here, every fixed-clock test would silently claim nothing — which is exactly
 * why `docs/conventions.md` says to inject the clock.
 */
export async function recordEffect(tx: Tx, ctx: Ctx, input: EffectInput): Promise<boolean> {
  const now = ctx.clock.now();
  return insertIgnore(tx, {
    scope: input.scope,
    scopeId: input.scopeId,
    eventType: input.eventType,
    payload: input.payload,
    now,
    ...(input.delayMs ? { runAt: new Date(now.getTime() + input.delayMs) } : {}),
  });
}

// ---------------------------------------------------------------------------
// Handler registry
// ---------------------------------------------------------------------------

const handlers = new Map<string, EffectHandler>();

const handlerKey = (scope: string, eventType: string) => `${scope}/${eventType}`;

/**
 * Registers the handler for one event type. Declared in
 * `core/<domain>/effects.ts`, which the `pnpm gen` effects bucket imports.
 */
export function registerEffectHandler(
  scope: string,
  eventType: string,
  handler: EffectHandler,
): void {
  handlers.set(handlerKey(scope, eventType), handler);
}

export function getEffectHandler(scope: string, eventType: string): EffectHandler | undefined {
  return handlers.get(handlerKey(scope, eventType));
}

export function registeredEffectTypes(): string[] {
  return [...handlers.keys()].sort();
}

/** Test helper. Never call this from app code. */
export function resetEffectHandlers(): void {
  handlers.clear();
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export interface DispatcherOptions {
  /** Rows claimed per pass. */
  batchSize?: number;
  /**
   * How long a claimed row stays invisible to other dispatchers. Must exceed
   * the slowest handler; a crashed dispatcher's rows come back after it.
   */
  leaseMs?: number;
  /** After this many attempts the row is parked as `unknown` for a human. */
  maxAttempts?: number;
  /** First retry delay; doubles each attempt up to `maxBackoffMs`. */
  baseBackoffMs?: number;
  maxBackoffMs?: number;
}

export interface DispatchReport {
  claimed: number;
  done: number;
  retried: number;
  parked: number;
}

const DEFAULTS = {
  batchSize: 20,
  leaseMs: 60_000,
  maxAttempts: 8,
  baseBackoffMs: 5_000,
  maxBackoffMs: 30 * 60_000,
} as const;

/** Exponential with a cap: 5s, 10s, 20s, … capped at 30 minutes. */
export function backoffMs(attempt: number, options: DispatcherOptions = {}): number {
  const base = options.baseBackoffMs ?? DEFAULTS.baseBackoffMs;
  const max = options.maxBackoffMs ?? DEFAULTS.maxBackoffMs;
  return Math.min(max, base * 2 ** Math.max(0, attempt - 1));
}

/** Errors are stored, so they must be short and must never carry a secret. */
function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
}

/**
 * One pass: claim what is due, run each handler, record the outcome.
 *
 * Claiming happens in its own short transaction that commits before any
 * handler runs, so no third-party call ever holds a row lock. Two dispatchers
 * running this concurrently never see the same row, because the claim uses
 * `FOR UPDATE SKIP LOCKED` and moves `next_run_at` past the lease before it
 * commits.
 */
export async function dispatchEffectsOnce(
  ctx: Ctx,
  options: DispatcherOptions = {},
): Promise<DispatchReport> {
  const batchSize = options.batchSize ?? DEFAULTS.batchSize;
  const leaseMs = options.leaseMs ?? DEFAULTS.leaseMs;
  const maxAttempts = options.maxAttempts ?? DEFAULTS.maxAttempts;
  const now = ctx.clock.now();

  const claimed = await withTx(ctx.db, (tx) => claimDue(tx, { limit: batchSize, now, leaseMs }));
  const report: DispatchReport = { claimed: claimed.length, done: 0, retried: 0, parked: 0 };

  for (const row of claimed) {
    const effect: Effect = {
      id: row.id,
      scope: row.scope,
      scopeId: row.scopeId,
      eventType: row.eventType,
      payload: row.payload,
      attempts: row.attempts,
    };
    const handler = getEffectHandler(row.scope, row.eventType);
    const finishedAt = ctx.clock.now();

    if (!handler) {
      // A handler may simply not be deployed yet; retry, then park.
      await settleFailure(ctx.db, effect, `no handler for ${row.scope}/${row.eventType}`, {
        maxAttempts,
        options,
        now: finishedAt,
        report,
        ctx,
      });
      continue;
    }

    try {
      await handler(ctx, effect);
      await markDone(ctx.db, row.id, ctx.clock.now());
      report.done += 1;
    } catch (error) {
      ctx.logger.warn(
        {
          err: error,
          effectId: row.id,
          scope: row.scope,
          eventType: row.eventType,
          attempt: row.attempts,
        },
        'effect handler failed',
      );
      await settleFailure(ctx.db, effect, describeError(error), {
        maxAttempts,
        options,
        now: ctx.clock.now(),
        report,
        ctx,
      });
    }
  }

  return report;
}

async function settleFailure(
  db: DbOrTx,
  effect: Effect,
  error: string,
  args: {
    maxAttempts: number;
    options: DispatcherOptions;
    now: Date;
    report: DispatchReport;
    ctx: Ctx;
  },
): Promise<void> {
  if (effect.attempts >= args.maxAttempts) {
    await markUnknown(db, effect.id, { error, now: args.now });
    args.report.parked += 1;
    args.ctx.logger.error(
      { effectId: effect.id, scope: effect.scope, eventType: effect.eventType, error },
      'effect parked as unknown after max attempts',
    );
    return;
  }
  const runAt = new Date(args.now.getTime() + backoffMs(effect.attempts, args.options));
  await scheduleRetry(db, effect.id, { runAt, error, now: args.now });
  args.report.retried += 1;
}

export interface DispatchRunOptions extends DispatcherOptions {
  /**
   * Stop claiming new batches after this long. The batch in hand is always
   * finished, so the run can overshoot by one batch's handlers. Keep it under
   * the repeat interval, so a run is over before the next one is due and a
   * redeploy never waits on an unbounded drain.
   */
  budgetMs?: number;
  /** A hard stop on batches per run, whatever the clock says. Default 100. */
  maxPasses?: number;
}

export interface DispatchRunReport extends DispatchReport {
  /** Batches claimed in this run. */
  passes: number;
  /**
   * How late the oldest row still waiting is, in ms, measured after the run:
   * `now - next_run_at` of the oldest pending, due, unleased row. `null` when
   * nothing is waiting. A number that grows run after run is a backlog.
   */
  oldestDueAgeMs: number | null;
}

const DEFAULT_BUDGET_MS = 4_000;

/**
 * The production dispatcher run: claim a batch, and while the batch came back
 * **full**, claim the next one straight away — until a batch comes back short
 * (nothing more is due) or the time budget is spent.
 *
 * Exactly one batch per tick would be a ceiling: 50 rows every 5 s is 10
 * effects/s per worker however long the queue is, and a paid order records
 * about six — under load the queue would only grow. The budget keeps the job's
 * promise that a run always returns.
 *
 * Time is `ctx.clock`, so a test drives the budget with a fake clock.
 */
export async function dispatchDueEffects(
  ctx: Ctx,
  options: DispatchRunOptions = {},
): Promise<DispatchRunReport> {
  const batchSize = options.batchSize ?? DEFAULTS.batchSize;
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const startedAt = ctx.clock.nowMs();
  const total: DispatchRunReport = {
    claimed: 0,
    done: 0,
    retried: 0,
    parked: 0,
    passes: 0,
    oldestDueAgeMs: null,
  };
  const maxPasses = options.maxPasses ?? 100;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const report = await dispatchEffectsOnce(ctx, options);
    if (report.claimed > 0) total.passes += 1;
    total.claimed += report.claimed;
    total.done += report.done;
    total.retried += report.retried;
    total.parked += report.parked;
    if (report.claimed < batchSize) break;
    if (ctx.clock.nowMs() - startedAt >= budgetMs) break;
  }
  total.oldestDueAgeMs = await effectsBacklogMs(ctx);
  return total;
}

/**
 * The age of the oldest effect that is due and still waiting, in ms, or
 * `null` when none is. For the dispatcher's log line and the `readyz` detail.
 */
export async function effectsBacklogMs(ctx: Ctx): Promise<number | null> {
  const now = ctx.clock.now();
  const at = await oldestDue(ctx.db, now);
  return at === null ? null : Math.max(0, now.getTime() - at.getTime());
}

/**
 * Drains the ledger until nothing is due. Only for tests and for a manual
 * "replay now" button — production runs `dispatchEffectsOnce` on a repeatable
 * job so one slow handler cannot starve the rest.
 */
export async function drainEffects(
  ctx: Ctx,
  options: DispatcherOptions & { maxPasses?: number } = {},
): Promise<DispatchReport> {
  const maxPasses = options.maxPasses ?? 50;
  const total: DispatchReport = { claimed: 0, done: 0, retried: 0, parked: 0 };
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const report = await dispatchEffectsOnce(ctx, options);
    total.claimed += report.claimed;
    total.done += report.done;
    total.retried += report.retried;
    total.parked += report.parked;
    if (report.claimed === 0) break;
  }
  return total;
}

export {
  findById as findEffectById,
  findOne as findEffect,
  listByStatus as listEffectsByStatus,
  listEffects,
  retryEffect,
};
export { RETRYABLE_EFFECT_STATUSES } from './effects.repo';
export type { EffectConsoleRow, EffectDetailRow, EffectListFilter, EffectRow };
