# CR-2-r1 — a join and a leader's refund on one team deadlock: the two take the group row and the activity SKU row in opposite orders

- **Stream:** R1 (reliability), found by the STAB-001 soak (round 1, seed 1). For the orchestrator: `core/src/groupbuy/**` is owned by no wave-6 stream.
- **Status:** OPEN
- **Severity:** medium. PostgreSQL detects the cycle within `deadlock_timeout` (1 s) and kills one side. That side is either the shopper's checkout, which gets a 500, or the refund's completion. The `order.refunded` hooks run inside the transaction that completes the refund (`refund/refund.service.ts`, `onOrderRefunded.dispatch`), so the completion rolls back and waits for whatever drove it (the gateway's redelivery, reconciliation) to run it again. Nothing is corrupted and nothing wedges. It is a 500 on a real checkout, and it happens on the busiest shape a team-buy has: people joining a team while its leader backs out.
- **Pinned by:** `groupbuy/groupbuy.concurrency.int.test.ts::leadership > passes to exactly one heir while a join is in flight`. This is the "groupbuy leadership" failure K2 saw once in its hung round 3 and left unfiled. It is timing-dependent. It passed 15/15 alone for K2, and failed here on the first STAB-001 round once CR-53-k2 no longer wedged the pool.

## What

```
DrizzleQueryError: Failed query: update "groupbuy_activity_skus" set "stock" = … + $1,
  "sales" = greatest(0, … - $2) where (activity_id = $3 and sku_id = $4)
cause: deadlock detected (40P01)
  Process 103 waits for ShareLock on transaction 2565; blocked by process 95.
  Process 95 waits for ShareLock on transaction 2563; blocked by process 103.
  while updating tuple (0,5) in relation "groupbuy_activity_skus"
```

The two transactions take the same two rows in opposite orders:

| step | the join: `groupbuyOrderHooks.afterCreate` (`groupbuy.order.ts`), inside B1's checkout transaction                                                                                              | the leader's refund: `handleRefunded` (`groupbuy.order.ts`), on `order.refunded`                              |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1    | `reserveActivityStock` updates `groupbuy_activity_skus` (then `groupbuy_activities`): **row lock on the activity SKU**                                                                          | `lockGroup`: `SELECT … FOR UPDATE` on `groupbuy_groups`: **row lock on the group**                            |
| 2    | `insertMember` into `groupbuy_members`. Its foreign key `group_id → groupbuy_groups` takes `FOR KEY SHARE` on the group row, which **conflicts with `FOR UPDATE`**, so it waits for the refund. | `releaseOrderLines` → `releaseActivityStock` updates the same activity SKU row, so it **waits for the join**. |

`handleRefunded`'s own comment says the group row is taken first "everywhere",
so that a promotion and a join queue instead of cycling. The join never takes
it explicitly, though. It takes it implicitly, through the foreign key, after
the stock row.

## Asked for

Make the join take the group row first, as the refund does. In `afterCreate`,
when `meta.groupId !== null`, call `repo.lockGroup(tx, groupId)` before the
`reserveActivityStock` loop. While it holds the lock, re-check that the team is
still `forming`. Today a join can land in a team that failed or was cancelled
a moment ago; the lock makes the check exact. Then both paths take the group
row first and the activity SKU second, and the cycle cannot form.

The alternative is to downgrade `lockGroup` to `FOR NO KEY UPDATE`, which does
not block the foreign key's `KEY SHARE`. That also breaks this cycle. But it
lets a join commit into a team while the refund decides the team is empty, the
race the lock exists to prevent. The explicit lock is the better fix.

Then flip nothing: the pinned test is a plain `it` that fails intermittently.
Run the file shuffled (for example
`pnpm exec vitest run --project int --sequence.shuffle --sequence.seed=<n> groupbuy.concurrency`
for twenty seeds) and then STAB-001's ten rounds.

## Evidence that the fix is enough

R1 tried the one-line version of this fix in its worktree and then reverted it.
It is not committed, because `groupbuy/` is not R1's. The line was
`if (meta.groupId !== null) await repo.lockGroup(tx, meta.groupId);` just
before the `reserveActivityStock` loop.

- **Unmodified tree:** STAB-001 seeds 1–10 gave 8 of 10. Seeds 1 and 9 failed,
  both on this test and both with this deadlock.
- **With the line:** the same seeds 1–10 gave **10 of 10**, and seeds 1 and 9
  passed.

Alone, the test passes (15/15 here, as K2 also found). It needs the rest of
the set's load to lose the race. The re-check of `forming` under the lock is
not part of the experiment.
