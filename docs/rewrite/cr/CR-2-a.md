# CR-2-a — the catalog needs four order facts and there is no port for them

**Stream:** A (catalog) **Status:** RESOLVED — port accepted, implementation still pending
**Files:** `next/packages/core/src/order/ports.ts` (frozen, orchestrator-owned)

## What

CONVENTIONS is unambiguous:

> A domain in `core` may import another domain only through that domain's
> `index.ts` or through ports in `core/src/order/ports.ts`. No reaching into
> another domain's repo or tables.

`order/ports.ts` declares `StockPort`, `PaymentPort`, `FreightPort`,
`PricingContributor`, `OrderKindHandler` and the hook registries. All six are
seams through which **order calls out**. There is no seam through which another
domain asks the order domain a question, and the catalog has four such
questions it cannot answer itself:

| question                                                             | used by                                      |
| -------------------------------------------------------------------- | -------------------------------------------- |
| may this user review this order line?                                 | `POST /api/v1/reviews`                       |
| how many of this product has this user bought (paid or beyond)?       | `purchaseLimitMode = 'lifetime'`             |
| which completed lines are still unreviewed and older than *n* days?   | the `catalog.autoReview` job                 |
| does any unfinished order still reference this product?               | the delete guard, `CATALOG_PRODUCT_IN_USE`   |

None of them can be inverted into a callback from the order domain. A review is
written when the shopper taps 评价, not when the order changes state; the
purchase limit is checked while rendering the product page; the auto-review job
sweeps on a cron. In each case the catalog is the caller and needs a read.

Routing them through `@shop/core/order`'s `index.ts` would work, but it makes
the catalog depend on the order domain's build at compile time — for four
read-only queries, on a stream that has to run *before* B2 exists.

## What stream A did

`next/packages/core/src/catalog/ports.ts` declares the port in the catalog,
with the same registry shape as `registerStockPort`:

```ts
export interface ReviewableLine {
  orderId: number;
  orderItemId: number;
  productId: number;
  skuId: number;
  specText: string;   // frozen on the line, so a spec rename cannot rewrite a review
  userId: number;
}

export interface OrderFactsPort {
  findReviewableLine(tx, { orderItemId, userId }): Promise<ReviewableLine | null>;
  purchasedQuantity(tx, { userId, productId }): Promise<number>;
  findLinesAwaitingReview(tx, { completedBefore, limit }): Promise<ReviewableLine[]>;
  hasOpenOrders(tx, productId): Promise<boolean>;
}

export function registerOrderFacts(impl: OrderFactsPort): void;
export function getOrderFacts(): OrderFactsPort;
```

`findReviewableLine` returns `null` for every refusal — not yours, not
delivered, already refunded, does not exist — because saying *which* would leak
another shopper's order data; the caller answers `CATALOG_REVIEW_NOT_ALLOWED`
for all of them.

`next/packages/core/src/catalog/catalog.order-bridge.repo.ts` registers a
temporary implementation that reads `orders` / `order_items` directly. It is
the only file in this stream that touches another domain's tables, it is
read-only, it is labelled at the top as existing to be deleted, and it is
imported for its side effect from `core/src/catalog/index.ts`.

The order-status values it assumes are the ones in `schema/order.ts` today:
reviewable is `received | completed`; a purchase counts from `paid` onwards;
open is anything before `completed` that is not `cancelled` or `refunded`.

## Ask

Move `OrderFactsPort` (or an equivalent) into `core/src/order/ports.ts` and have
B2 call `registerOrderFacts()` from the order domain's `index.ts`, the way
stream A calls `registerStockPort()`.

If the orchestrator would rather keep `ports.ts` strictly outbound, the
alternative that also works is for B2 to import the interface from
`@shop/core/catalog` and register against it — the registry already supports
that and no catalog code changes. Either way the bridge file is deleted and
nothing else moves.

## Risk if nothing happens

The bridge keeps working, so nothing breaks. The cost is that the order status
vocabulary is written down in two places, and a future status (`closed`,
`partially_refunded`) has to be added to both. That is precisely the kind of
quiet divergence the port convention exists to prevent, which is why this is
filed rather than left as a comment.

## Resolution

Accepted as filed. `OrderFactsPort`, `ReviewableLine`, `registerOrderFacts` and
`getOrderFacts` now live in `core/src/order/ports.ts` beside `StockPort`, with
the same interface, and `resetOrderPorts()` clears the slot.

`core/src/catalog/ports.ts` is deleted; the three catalog files that used it
import from `../order/ports`, and `@shop/core/catalog` no longer re-exports the
interface — callers take it from the order domain like every other port.

`catalog.order-bridge.repo.ts` stays for now: the port exists, an
implementation does not, and the review routes, the lifetime purchase limit and
the auto-review job all need one. It still registers the stand-in and the
orchestrator moves the file into the order domain at merge. The moment anything
calls `registerOrderFacts()` later in the import order, that registration wins
and no catalog code changes.
