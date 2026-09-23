# CR-4-b1 — four invariant rows sit in B1's sections but belong to streams that own the feature

**Status (R5 sweep, 2026-09-23): RESOLVED** — decided by the ledger: PRICE-001/002 retired, STOCK-004 and QUEUE-008 ported (`475f59217`). The status line below is kept as history.

- **Stream:** B1 (cart and checkout)
- **Status:** needs an ownership decision from the orchestrator before gate K
- **Affects:** `docs/rewrite/invariants.md` (sections "Pricing" and "Stock")

Stream K fails the build while any row is `unmapped`, so these four cannot be
left as they are. B1 cannot port them either: the features they describe are not
in B1's scope, and writing a test for a contributor that does not exist would be
writing the contributor.

| Row | Invariant | Why it is not B1's |
|---|---|---|
| PRICE-001 | Integral deduction accounts for frozen points and the configured maximum. | Points are a `PricingContributor` (`core/src/order/ports.ts`). B1 owns the pipeline that calls contributors in priority order and splits their adjustments across the lines — `order.pricing.test.ts` covers that — but the points rules (frozen balance, `integral_max` config, the ledger write on payment) belong to whoever ships the points domain. |
| PRICE-002 | Disabled integral deduction leaves price and available points unchanged. | Same. "Disabled" means the contributor is not registered, which B1 already covers implicitly (no contributor, no adjustment); the *points* half needs the points domain. |
| STOCK-004 | Activity inventory requires sufficient stock and quota in the same update. | Activity stock (seckill, group-buy, presale) is an `OrderKindHandler`. B1's `StockPort` covers ordinary SKU stock, one statement per line with the precondition in the WHERE (STOCK-001..003, ported). A handler that also has to decrement a per-activity quota in the same statement must ship with the handler. |
| QUEUE-008 | Cancelling a presale order restores all four ledgers. | Presale is the same `OrderKindHandler` seam. B1's cancel releases through the `StockPort` it was given and calls `onOrderCancelled`; a kind that reserved extra ledgers gives them back in its own hook. |

## What B1 has already provided so these are easy to close

- `registerPricingContributor(contributor)` — `contribute(ctx, draft)` returns
  `PriceAdjustment[]`; a negative `amount` is a discount, a non-negative one is
  ignored rather than becoming a surcharge. Optional `perLine` lets a
  contributor decide its own split; otherwise B1 splits by line weight and
  clamps to each line's remaining value.
- `registerOrderKindHandler(handler)` — `beforeCreate` may veto or annotate,
  `afterCreate` gets the committed `orderId` inside the same transaction,
  `canTransition` may refuse a move the base machine allows. An order whose
  `kind` has no registered handler is refused at create
  (`order.int.test.ts::refuses an order kind whose handler has not shipped`).
- `onOrderCancelled` fires inside the cancelling transaction, so a kind can
  restore its own ledgers atomically with the stock release.

## Suggested resolution

Move PRICE-001 and PRICE-002 to the points/marketing stream, and STOCK-004 and
QUEUE-008 to the activity-kinds stream. If neither exists in this wave, mark all
four `deferred` with the owning stream named, rather than leaving them in a
section whose owner cannot close them.
