# Stream D — Group buy and presale

**Worktree** `../CRMEB-wt/ws-d` · **Branch** `rewrite/ws-d-marketing` · **Domains** `groupbuy`, `presale` · reference-map section "D — Marketing" · starts after A is merged and B1's contracts + ports are merged

## How you attach to orders
You never edit `core/order`. You plug in through `core/src/order/ports.ts`: a `PricingContributor` (activity price replaces SKU price; coupons are not combinable unless the activity allows it), a `StockPort` for the activity's own stock counter (reserved and released **together with** the SKU stock, in B1's transaction), and the `onOrderPaid / onOrderCancelled / onOrderRefunded` hooks (run inside the order transaction; anything external goes through `recordEffect`).

## Group buy
Admin: activities CRUD (product, per-SKU group price and stock, group size, duration, per-user limit, virtual-fill switch), group list with members, "complete now" (virtual fill, audited with the operator), statistics. Storefront: activity list/detail, open a group or join one at checkout, my groups, group status page data. Posters are drawn client-side: return the data and a QR payload only.

Seats: `groupbuy_groups.seats_taken` moves by a single conditional update (`seats_taken < seats_total AND status = 'open'`); the seat is taken in `onOrderPaid`, not at order creation. The last seat completes the group in the same transaction. Expiry job (delayed per group + sweeping repeatable): fill virtually if allowed, else fail the group and request refunds for paid members through stream C's public API. A refunded member frees the seat; a refunded **leader** hands leadership to the earliest remaining paid member (`groupbuy_members_leader_uq` holds), and an empty group fails.

## Presale
Admin: activities CRUD (product, per-SKU presale price and stock, sale window, ship-after-days promise), orders view. Storefront: list/detail. Full-payment presale only; the deposit columns exist in the schema but stay inert — do not build deposit flows. Window jobs: open/close activities on time (replaces `advanceOff`). Presale stock is a separate counter from SKU stock; every ledger that moves on create must move back on cancel and on refund (activity stock, SKU stock, sales counters, per-user purchase count).

## Invariants to prove
Rows under the group-buy and presale sections of `docs/rewrite/invariants.md` and risk-matrix §5, plus STOCK-004 and QUEUE-008 (reassigned from B1). An order `kind` needs a registered `OrderKindHandler` (see `docs/rewrite/status/b1.md`); only `normal` exists today, so you register `groupbuy` and `presale`. Concurrency tests (mandatory): last seat taken by two paid callbacks → one member, the other order is refunded through C; expiry racing the last join → one outcome; leader refund racing a join; presale last unit by two checkouts; cancel racing pay on a presale order leaves all four ledgers balanced.

## Fix, don't port
- Legacy runs group notifications inside the group transaction unless `deferEffects` is passed; here every notification is an effect, always.
- Two `StorePink` models exist in the old code; read both before trusting a relation.

## Out of scope
Bargain, seckill, points mall, lottery, live — retired. Deposit presale. Poster rendering on the server.
