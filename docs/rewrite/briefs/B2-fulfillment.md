# Stream B2 — Fulfillment and the order console

**Worktree** `../CRMEB-wt/ws-b2` · **Branch** `rewrite/ws-b2-fulfil` · **Domain** `order/{fulfil,invoice,staff}` + admin pages `orders` · reference-map section "B2 — Fulfillment" · starts after B1's contracts and `OrderStateMachine` are merged

## Scope
Admin order console: list with the legacy filter set (status, fulfilment status, kind, time, keyword, user), detail, status timeline (`order_status_logs`), remark, price change before payment (recompute payable through B1's pricing entry point, never by hand), export (CSV/XLSX stream), order statistics header.

Shipping: `shipments` + `shipment_items` + `order_items.shipped_quantity`. **There is no order splitting** — a partial shipment is a shipment that covers some items/quantities; `orders.fulfillment_status` goes `unshipped → partially_shipped → shipped`. Express shipment (company + number), "no logistics needed" shipment, edit shipment info, logistics tracking query through `shipping`'s index (F2; code against its contract until it lands). Virtual delivery, three shapes kept separate: plain virtual goods (operator confirms), card keys (claim one `product_virtual_cards` row per order item in the paid effect — quantity is always 1), coupon goods (call `coupon.grantOrderGifts`-style API through coupon's index).

Receipt: user confirm, admin confirm, auto-receive job (delayed per shipment-complete + sweeping repeatable), then `completed` after the review window. All through `OrderStateMachine.transition`.

Invoices (manual): user requests → admin marks issued with number/remark, or rejects; one open invoice per order (partial unique index exists).

Staff surface `/api/v1/staff/*` (auth `staff`): statistics, order list/detail, remark, price change, ship, logistics, refund list/detail/review hand-off to stream C's service. Who is staff is the config list of user ids (legacy `order_notice_admin_uids`), exposed as a typed config group — not a role.

## Invariants to prove
`docs/rewrite/invariants.md` rows FULFILL-*, VIRTUAL-*, the receipt/delivery rows under "Queue and lifecycle" and "Core business invariants". Concurrency tests (mandatory): two simultaneous ships of the same item quantity → shipped quantity never exceeds ordered minus refunded; two simultaneous receipts → one transition, one set of effects; ship racing a refund approval on the same item → exactly one wins; card-key claim under concurrent paid effects → one card per order item.

## Fix, don't port
- `takeOrder` / `delivery` are read-then-write without locks in the old code: use conditional updates and `lockRow` on the order when items and order must agree.
- The legacy parent/child order cascade (`StoreOrderServices.php:1064-1076`) disappears with splitting; do not recreate it.
- The uni-app staff UI calls split/offline endpoints that never existed. Do not add them; list them for stream H as removed.

## Out of scope
Order creation, pricing, cancel (B1); payment and refunds (C) — you render refund state and link to C's pages; printers, e-invoice providers, electronic waybills, store pickup / write-off, city delivery.
