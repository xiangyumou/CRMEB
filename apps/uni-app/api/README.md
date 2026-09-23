# `api/` — the API client and the page-field mappers

The pages and components under `pages/`, `components/`, `mixins/` and `subpackage/` read
snake_case view models (`res.data.order_id`, `res.data.cartInfo`, …). The REST API under
`/api/v1/` speaks camelCase DTOs. This directory is the one place that knows both: it
calls the API and maps each payload onto the fields the page reads, so no page ever
touches a DTO.

## The three layers

```
pages / components          read res.data.<snake_case> and res.msg
      ↑
api/*.js                    one exported function per page-facing call
      ↑  map: toPageX
api/mappers/<domain>.js     pure DTO → page view-model functions (and fromPageX back)
      ↑
utils/request.js            HTTP: bearer token, X-Client-Platform, JSON, real statuses
```

## The resolved value

`utils/request.js` always resolves with

```js
{ data: <mapped payload>, msg: '', status: 200 }
```

`data` is what the page reads (`res.data.list`, `res.data.count`, …). `msg` and the
literal `status: 200` exist because 71 call sites toast `res.msg` and a handful compare
`res.status`; they are **envelope** fields and have nothing to do with the business
`status` some payloads carry (`res.data.status`).

The API expresses success with the HTTP status line, so there is no message to forward
and `msg` defaults to the empty string. A page that toasts `res.msg` after a successful
write would then show an empty title, so the `api/*.js` function supplies one through
`opt.msg` — a literal string, or a function of the raw payload:

```js
export function collectAdd(id) {
  return request.post('/api/v1/me/favorites', { productId: String(id) }, { msg: '收藏成功' });
}
```

## The rejected value

Every rejection is an object — never a bare string, and never a promise that hangs:

```js
{ status: <http status, 0 for a network failure>,
  code:   'ORDER_ALREADY_PAID' | 'HTTP_ERROR' | 'NETWORK' | 'UNAUTHENTICATED' | 'MAP_ERROR',
  message: '订单已支付',
  msg:     '订单已支付',      // alias: pages toast err.msg
  details: { … }             // present only when the server sent one
}
```

`msg` is an alias of `message` so `catch (err) => Tips({ title: err.msg })` keeps working,
and because some pages toast the rejection itself the object's `message` is always
user-safe Simplified Chinese from the server.

What callers can rely on:

- Every error status rejects; nothing swallows the promise.
- `401` clears the session, redirects to login **once** per burst of failures, and rejects.
- A transport failure rejects with `status: 0, code: 'NETWORK'`.
- There is no `noVerify`; the HTTP status decides.

## Writing an `api/*.js` function

```js
import request from '../utils/request.js';
import { toPageCartList } from './mappers/cart.js';

export function getCartList(data) {
  return request.get('/api/v1/cart', { page: data.page, pageSize: data.limit }, {
    map: toPageCartList,
  });
}
```

Rules:

- The **URL is a literal** starting with `/api/v1/`, so `scripts/check-api-routes.mjs`
  can prove every call resolves to a route in `packages/contracts/openapi.json`.
- The exported **name and parameters are what the pages call**; change the body, not the
  signature.
- Anything that reshapes a payload lives in `api/mappers/`, is pure, and is unit-tested
  against the contract example.
- A call whose contract does not exist yet carries `// CONTRACT-PENDING(<owner>)` above
  it; the guards list every such marker.

## Mapper conventions

| API DTO                              | page view model                         |
| ------------------------------------ | --------------------------------------- |
| camelCase keys                        | snake_case keys                         |
| money as `"12.00"` string             | stays a string — pages concatenate it   |
| ISO-8601 instant                      | `'YYYY-MM-DD HH:mm:ss'`, or unix seconds where the page does arithmetic |
| id as decimal string                  | number **only** where a page does `==` against a number or arithmetic |
| absent optional omitted / `null`      | the falsy value the page tests for (`0`, `''`, `[]`) |

Features the shop does not run (bargain, seckill, points, sign-in, distribution,
membership, balance, offline pay, store pickup) have no API. Where a page still reads
their flag the mapper returns a constant falsy value so the dead branch collapses without
touching the page.
