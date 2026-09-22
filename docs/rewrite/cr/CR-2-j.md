# CR-2-j — `order-fulfil.reviewWindowDays` claims `order_activity_time`, which is neither

- **Stream:** J (ETL runner)
- **Status:** accepted — J's follow-up points `order-fulfil.legacyKeys.reviewWindowDays` at `system_comment_time` (days on both sides, no transform) and deletes the override entry
- **Landed:** `eccea635` — `reviewWindowDays: 'system_comment_time'`; `IGNORED_CONFIG_CLAIMS` is now empty (the mechanism stays); `order_activity_time` keeps its drop-list reason.
- **Affects:** the config group `order-fulfil` (`legacyKeys.reviewWindowDays`),
  `next/packages/etl/src/config-overrides.ts`,
  `next/packages/etl/src/config-dropped.ts`

## What happened

`order-fulfil` declares `reviewWindowDays: 'order_activity_time'`. In the legacy
schema:

- `order_activity_time` is **活动未支付订单取消时间**, in **hours** — how long an
  activity order (seckill / bargain) may stay unpaid. Default 1.
- The review window is **`system_comment_time`**, in **days**.

So the claim is wrong twice over: wrong setting, wrong unit. Migrating it would
take "1" (one hour), apply the hours → minutes transform that
`CONFIG_VALUE_TRANSFORMS` attaches to this class of key, and store a review
window of 60 — displayed as sixty days. The value is plausible enough that
nobody would question it, which is what makes it worth a CR rather than a quiet
fix.

## What the ETL does now

`config-overrides.ts` parks the claim: `order_activity_time` is not routed to
`order-fulfil.reviewWindowDays`, and `reviewWindowDays` takes its schema default
on migration. `config.test.ts` asserts the parked claim still exists in the
registry, so the entry fails the build once the owner fixes `legacyKeys` — it
cannot rot.

`order_activity_time` itself is on the drop list with its reason: activity-order
expiry left with seckill and bargain, and group-buy and presale each carry their
own timer, so the key has no successor.

## What the owner should do

Either point `reviewWindowDays` at `system_comment_time` (and check the unit —
days on both sides, so no transform), or drop the `legacyKeys` entry entirely
and let the field take its default. Then delete the entry from
`config-overrides.ts`; the test will tell you if you forget.
