# CR-4-c — the effects ledger has no operator-facing read, and no way back from `unknown`

**Stream** C · **Target** `next/packages/core/src/effects/effects.repo.ts` and `index.ts` (platform-owned) · **Severity** medium, operational

## What

`effects.repo.ts` exposes exactly one read for a human — `listByStatus(db,
status, limit = 100)` — and no write that moves a row back into play. The row
shape (`EffectRow`) has no `createdAt`/`updatedAt` either, so a list cannot be
ordered by "most recently broken".

An `unknown` row is, by the ledger's own doc comment, the end of the line: the
dispatcher stops claiming it after the last retry and someone is expected to
look. But there is nothing to look _with_:

- no filter by `scope` or `eventType`, so an operator hunting a stuck
  `refund.execute` pages through every domain's rows;
- no offset and no total, so the admin table cannot paginate — `limit = 100`
  and then silence;
- nothing that sets `unknown → pending`, so the only cure for a ledger row that
  failed against a third party during an outage is a hand-written `UPDATE`
  against production.

That last one matters most for this stream. `refund.execute` is the effect that
moves money. When WeChat is down for twenty minutes, every approved refund in
that window ends `unknown` and the shop has no button that says 重试.

## Asked for

Two additions to the platform repo, both trivial and both needed by the effects
console the admin brief assigns to this stream:

```ts
export interface EffectListQuery {
  status?: EffectStatus;
  scope?: string;
  eventType?: string;
  page?: number;
  pageSize?: number;
}

export async function listEffects(
  db: DbOrTx,
  query: EffectListQuery,
): Promise<{ rows: EffectRow[]; total: number }>;

/** `unknown → pending`, attempts reset, due immediately. Returns `{ won }`. */
export async function requeue(
  tx: DbOrTx,
  id: number,
  now: Date,
): Promise<{ won: boolean }>;
```

`requeue` must be a conditional update (`WHERE id = $id AND status = 'unknown'`)
and must return whether it won, so two operators clicking 重试 at the same moment
produce one requeue and one "已经重新排队", not two gateway calls. Exposing it
through `effects/index.ts` alongside `drainEffects` keeps the boundary rule
happy — domain code must not import `effects.repo` directly.

Adding `createdAt`/`updatedAt` to `EffectRow` (the columns exist) would let the
console sort by age, which is how an operator actually reads this screen.

## Meanwhile

`packages/core/src/payment/payment.effects.repo.ts` implements all three
queries — `listEffects` (filtered, paginated, `count(*)` total, ordered by
`updated_at desc`), `findEffectById` and `requeueEffect` — in the domain that
ships the console rather than in the platform repo it does not own. It is a
`*.repo.ts`, so it is exempt from the `@shop/db/schema/*` boundary rule, and it
reads the same table the dispatcher does.

`requeueEffect` is the conditional update this CR asks for, guarded on
`status = 'unknown'`, and `adminRetryEffect` reports `succeeded: false` with 该
任务当前状态无法重试 when it loses. The handler is deliberately **not** run in
the admin request: the row goes back to `pending` with `next_run_at = now` and
the dispatcher takes it within its five-second poll, because a handler that
calls WeChat has no business on a request thread.

Every read is constrained to `scope in ('payment','refund','order')` by the
caller, so this stream's console cannot quietly become everybody's. If this CR
is accepted, the file becomes a re-export and the scope filter stays where it
is.
