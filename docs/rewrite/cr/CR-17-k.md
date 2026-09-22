# CR-17-k — nineteen admin writes on the notification and WeChat OA surfaces name no audit target

**Stream:** K (hardening) **Status:** OPEN — for streams N1 (notifications) and E3 (WeChat OA)
**Files:** `next/apps/web/app/admin-api/notification-logs/**`,
`next/apps/web/app/admin-api/notification-templates/**`,
`next/apps/web/app/admin-api/wechat-auto-replies/**`,
`next/apps/web/app/admin-api/wechat-media/**`,
`next/apps/web/app/admin-api/wechat-menus/**`,
`next/apps/web/app/admin-api/wechat-qrcode*/**`

## What

`handle()` writes an `audit_logs` row for every mutating admin request by
itself, but the **target** — which menu, which QR code, which template — can
only come from the handler, as one call:

```ts
// apps/web/app/admin-api/coupons/route.ts:22
ctx.audit(`coupon:${created.id}`);
```

Seventeen route files that merged with E2 do not make it. `pnpm guards`'
`route-hygiene` check lists them; they are now carried as named entries in
`AUDIT_EXEMPT` with this CR's number, so the guard stays green and the list
shrinks as they are fixed.

| route                                                       | method      | owner |
| ----------------------------------------------------------- | ----------- | ----- |
| `/admin-api/notification-logs/:id/retry`                    | POST        | N1    |
| `/admin-api/notification-templates/:code`                   | PUT         | N1    |
| `/admin-api/notification-templates/:code/channels/:channel` | POST        | N1    |
| `/admin-api/wechat-auto-replies`                            | POST        | E3    |
| `/admin-api/wechat-auto-replies/:id`                        | PUT, DELETE | E3    |
| `/admin-api/wechat-auto-replies/:id/status`                 | POST        | E3    |
| `/admin-api/wechat-media`                                   | POST        | E3    |
| `/admin-api/wechat-media/:id`                               | DELETE      | E3    |
| `/admin-api/wechat-media/sync`                              | POST        | E3    |
| `/admin-api/wechat-menus`                                   | POST        | E3    |
| `/admin-api/wechat-menus/:id`                               | PUT, DELETE | E3    |
| `/admin-api/wechat-menus/:id/publish`                       | POST        | E3    |
| `/admin-api/wechat-qrcode-categories`                       | POST        | E3    |
| `/admin-api/wechat-qrcode-categories/:id`                   | PUT, DELETE | E3    |
| `/admin-api/wechat-qrcodes`                                 | POST        | E3    |
| `/admin-api/wechat-qrcodes/:id`                             | PUT, DELETE | E3    |
| `/admin-api/wechat-qrcodes/:id/status`                      | POST        | E3    |

Two more were looked at and **decided**, not exempted as defects:
`POST /admin-api/notifications/:id/read` and `POST /admin-api/notifications/read-all`
mark the caller's own inbox item read. The row would record "an admin read
their own notification", which is not a question anybody asks of an audit log,
and the actor is already on the row `handle()` writes. They are on the list
with a reason and no CR.

## Why it matters

`/admin-api/wechat-menus/:id/publish` is the sharp one: it pushes a menu to
WeChat, where every follower of the official account sees it. When the menu
turns out to point somewhere wrong, `audit_logs` can say that _somebody_
published _something_ at 14:31 and no more. The same goes for
`wechat-media/sync` (pulls WeChat's library into the shop's) and every
auto-reply write, which is the text the account sends to a customer.

This is not a hole an attacker walks through; it is the hole that opens **after**
an incident, when the log cannot answer which object changed. The legacy system
had the same shape of gap, and PLAN §5 keeps it in scope precisely because it
is invisible until it matters.

## Proposed fix

One line per handler, naming the object the write touched, in the form already
used across the admin (`<domain>:<id>`):

```ts
export const POST = handle(wechatOaMenuCreate, async (ctx, { body }) => {
  const created = await wechatOaMenu.create(ctx, body);
  ctx.audit(`wechat-menu:${created.id}`);
  return created;
});
```

For the two sync-style routes that touch many objects at once
(`wechat-media/sync`), the target is the operation rather than a row —
`wechat-media:sync` — which still answers "who ran it, and when".

## Test that would have caught it

`route-hygiene` in `pnpm guards` is the test, and it did catch it; what is
missing is that it ran for the first time only now. Once CI carries
`pnpm guards` (**CR-4-k** §1), a route merging without an audit target fails
the build on the branch that adds it.
