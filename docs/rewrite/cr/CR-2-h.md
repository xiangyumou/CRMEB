# CR-2-h — three cart operations the storefront performs and the contract cannot express

- **Stream:** H (uni-app storefront), raised against B1 (cart and checkout)
- **Status:** **resolved** — all three accepted, stream S, `73e616b0`

> **Decision.** Change a row's SKU, decrement by SKU, and batch favourite all
> got routes. See `docs/rewrite/status/s.md`.
- **Affects:** `next/packages/contracts/src/cart/cart.contract.ts`

The cart contract covers the shopping cart as a list of rows. The uni-app does
three things to it that the route set has no shape for. Each is a real screen,
not a legacy quirk.

## 1. Changing a row's SKU (「修改规格」)

`pages/users/cart/index.vue` opens the spec picker on a cart row and posts the
newly chosen SKU. Today the only write is `PATCH /api/v1/cart/items/:id`, whose
body is `{quantity}`, so `getResetCart` (`api/order.js`) deletes the row and adds
a new one. That loses the row's position and its selected state, and a failure
between the two calls leaves the buyer with no row at all.

**Ask:** let `PATCH /api/v1/cart/items/:id` take `{skuId?, quantity?}`. The
merge rule is the one `addItem` already has — if another row already holds that
SKU, fold into it and answer with the surviving row.

## 2. Decrementing by SKU, without knowing the row id

The product detail page's stepper (`pages/goods/goods_details/index.vue`) knows
the SKU it is looking at, not whether a cart row exists for it, and legacy's
`cart/add` accepted a negative `cartNum` to mean "take one off". The rewrite's
`POST /api/v1/cart/items` sensibly refuses a negative quantity, so the page has
to list the cart first to find the row id.

**Ask:** accept `quantity: -1` on `POST /api/v1/cart/items` (removing the row
when it reaches zero), or add
`POST /api/v1/cart/items/decrements {skuId, quantity}`. Either removes a list
round trip from the hottest screen in the app.

## 3. Adding several favourites at once

`pages/users/user_goods_collection/index.vue` has a 批量收藏 button; the
contract has `POST /api/v1/me/favorites` for one product at a time. The page
currently fires N requests, which is N chances to half-succeed.

**Ask:** `POST /api/v1/me/favorites` should take `{productIds: string[]}` as
well as a single id, answering with the resulting favourite state per id. (This
one is stream A's surface if favourites moved there — routed here because the
call site is H's.)

## Until then

1. `getResetCart` does delete + add, and can lose the row in between.
2. `postCartAdd` lists the cart (`filter: all`, `pageSize: 100`) to find the row
   before it can decrement it — `api/store.js`.
3. `collectAll` fires one request per product and reports success only if every
   one of them succeeded.
