# CR-1-h — `GET /api/v1/orders/:id` should accept an order number

- **Stream:** H (uni-app storefront), raised against B1 (cart and checkout)
- **Status:** open
- **Affects:** `next/packages/contracts/src/order/order.checkout.contract.ts`,
  and the same `:id` on the fulfilment sub-resources B2 added

## What is missing

The uni-app carries one identifier for an order and uses it for two things at
once: it **prints** it (订单号：{{ item.order_id }}) and it **routes** on it
(`/pages/goods/order_details/index?order_id=` + …). Legacy could do that because
`order_id` was the order *number* and every order route took the number.

The new `orderDetail` has both `id` (a decimal-string surrogate) and `orderNo`
(the 24-digit human number), and `GET /api/v1/orders/:id` takes the surrogate.
So the mapper has to choose which one goes in `order_id`, and either choice
breaks one of the two uses:

| `order_id` = | 路由 works | 订单号 displays |
| ------------ | ---------- | --------------- |
| `id`         | yes        | shows `9001`, not the number the buyer sees on the payment receipt |
| `orderNo`    | no (404)   | yes             |

`api/mappers/order.js` currently sets `order_id: id` and carries the number in
`order_no` / `trade_no`, so routing works and a handful of screens print a
surrogate where the buyer expects their order number. Six templates would have
to change to print `order_no` instead, which is page surgery this stream is
scoped out of — and it would still leave any deep link a customer service agent
pastes (which is always the order *number*) dead.

## Why it matters

The order number is the only identifier that appears outside the app: on the
WeChat payment record, in the 客服 conversation, in the operator's console. A
storefront route that cannot be reached by it makes every one of those a manual
lookup.

## Suggested fix

Let the `:id` of the storefront order routes be **either**:

```ts
/** The order's surrogate id, or its `orderNo`. Both are unambiguous: `orderNo` is 24 digits. */
export const orderRef = z.string().regex(/^\d{1,24}$/);
```

`orders_order_no_uq` already exists, so the lookup is
`where(or(eq(orders.id, ref), eq(orders.orderNo, ref)))` with a length test to
pick the column — no ambiguity, because ids are short and order numbers are 24
digits.

If B1 would rather not widen the param, the alternative that also works is a
`GET /api/v1/orders/by-no/:orderNo`; H would then resolve once and route on the
surrogate. That costs a round trip on every deep link, which is why widening
`:id` is the ask.

## Until then

`order_id` is the surrogate and the affected screens print it. Nothing is
broken; the number is simply not what the buyer recognises.
