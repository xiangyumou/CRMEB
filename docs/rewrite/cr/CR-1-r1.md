# CR-1-r1 — three more config reads take a second pooled connection inside a transaction

- **Stream:** R1 (reliability), found by the new `tx-pool` guard (CR-53-k2 part 2); for the orchestrator, **suggested owner R2** (order) — the freight port is in `shipping/`, which no wave-6 stream owns, but it is only reached from R2's checkout
- **Status:** OPEN
- **Severity:** medium. The mechanism is CR-53-k2's. Since R1 the pool fails an acquire after 5 s (`DB_POOL_ACQUIRE_TIMEOUT_MS`), so the outcome is a burst of failed checkouts, not a wedged process.
- **Pinned by:** `pnpm guards tx-pool` — each line is a `pending(R2)` finding (`TX_POOL_OWED` in `next/guards/src/checks/tx-pool.ts`), which becomes a failure once R2 is marked merged.

## What

CR-53-k2's stock reservation was one instance of a class: a function holding a
transaction reads through the pool. On a config cache miss (the TTL is five
minutes, and every save drops it), `ctx.config.get` takes a **second** pooled
connection. With `max` callers doing that at once, every connection is held by
a caller that wants another, and nobody gets one. No row lock is needed for
that; a lock only makes one hot row enough.

The guard found three more. None is in R1's ownership.

| site                                                                                       | why it is inside a transaction                                                                                               |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `order/order.checkout.service.ts:336`, `buildDraft`: `ctx.config.get(orderConfig)`         | `create` calls `buildDraft(ctx, tx, …)` as the first thing in its `withTx`. Every checkout in a cold-cache moment wants two. |
| `shipping/shipping.freight.port.ts:50`, `freightPort.quote`: `ctx.config.get(orderConfig)` | called from `buildDraft` with the same `db` (the checkout transaction on the `create` path)                                  |
| `order/order.fulfil.effects.ts:226`, `autoDeliver`: `ctx.config.get(orderFulfilConfig)`    | inside its `withTx`, after the card rows are claimed and the order row is held; worker pool is 5                             |

`checkout.create` is the web process's hottest write. Ten simultaneous
checkouts (the web pool, `DB_POOL_MAX` 10) arriving as the `order` group's
cache expires is the same flash-sale shape CR-53-k2 describes.

`notification.send.ts:111`, which CR-53-k2 also named, is **not** an instance:
`sendWechatMini` runs from `fanOut`, the effects handler, after the business
transaction committed and with no transaction open (the dispatcher claims in
its own short transaction and runs handlers outside it). R1 left it unchanged;
the guard agrees.

## Asked for

At each site, read through the handle the function was given:

```ts
const { payWindowMinutes } = await ctx.config.getIn(db, orderConfig); // buildDraft
ctx.config.getIn(db, orderConfig),                                    // freightPort.quote
const { autoReceiveDays } = await ctx.config.getIn(tx, orderFulfilConfig); // autoDeliver
```

`ctx.config.getIn(handle, group)` (R1, `kernel/config-registry.ts`) is exactly
`get` when it is handed the pool, so the preview path keeps its cache fill. On
a transaction it reads the cache, and on a miss reads the rows through the
transaction without filling the cache.

Then delete the three `TX_POOL_OWED` entries in `next/guards/src/checks/tx-pool.ts`.
They are exactly compared, so a fixed line with its entry still present fails
as stale. If the orchestrator applies this after R1 and R2 have both merged,
it is one commit across `order/`, `shipping/` and `guards/`.
