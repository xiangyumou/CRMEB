# S — storefront contract gaps (CR-1..5-h)

Branch `rewrite/ws-s-storefront-gaps`, worktree `../CRMEB-wt/ws-s`. Nothing pushed.

Brief: `docs/rewrite/briefs/S-storefront-gaps.md`. The decision table there is
binding; this file records what landed and the calls each row made on the way.

## Baseline

```
$ cd template/uni-app && npm run check:routes
189 calls: 85 live, 104 pending, 0 broken
$ npm test
Test Files  9 passed | 1 skipped (10)   Tests  229 passed | 8 skipped (237)
```

## The decision table, row by row

| Row | State | Commit |
| --- | ----- | ------ |
| CR-1-h — order number as `:id` | **done** | `29106ab3` |
| CR-2-h (1) — change a row's SKU | **done** | `73e616b0` |
| CR-2-h (2) — decrement by SKU | **done** | `73e616b0` |
| CR-2-h (3) — batch favourite | **done** | `73e616b0` |
| CR-3-h — category ETag / version | **done** | `0e9e9d6e` |
| CR-4-h §1 — statistics per day | **done** | `64485732` |
| CR-4-h §2 — staff remark on a refund | **done** | `1d566b96` |
| CR-4-h §3 — 直接退款 rejected | **done** (UI branch deleted) | `8ae2ebe9` |
| CR-4-h §4, §5 — 配送员 / 电子面单 out of scope | **done** (branches deleted) | `8ae2ebe9` |
| CR-4-h §6 — buyer hides a finished order | **done** | `f80757d1` |
| CR-4-h §7 — invoice line summary | **done** | `7356c26c` |
| CR-5-h — upload field name and staff purpose | **done**, one page edit left to H2 | `ea91eb78` |

Nothing is left open in the decision table. No schema CR was needed: every
column the table asked about already exists (`orders.hidden_by_user_at` as
`hiddenByUserAt`, `order_status_logs_change_type.hidden_by_user`). The one that
did **not** exist, `refunds.staff_remark`, is handled by the brief's own
fallback — the note is appended to `refund_logs` — so `packages/db` was never
touched.

## Counts

```
$ cd template/uni-app && npm run check:routes
185 calls: 88 live, 97 pending, 0 broken        # from 189: 85 live, 104 pending
$ npm test
Test Files  9 passed | 1 skipped (10)   Tests  243 passed | 8 skipped (251)
```

Four calls left the app rather than becoming live: `orderExportTemp`,
`orderDeliveryInfo`, `orderOrderDelivery` (CR-4-h §4/§5, retired) and legacy's
second 统计 endpoint, which now reads the same series as the first.

## Decisions other streams must know

### CR-1-h — the staff surface keeps the surrogate id

`orderRef` (`packages/contracts/src/order/order.ref.schemas.ts`) is accepted by
the storefront order routes, the storefront payment route and
`GET /api/v1/refunds/applicable-items/:orderId`. It is **not** accepted by
`/api/v1/staff/orders/:id` or by `/admin-api/orders/:id`.

The reason is the resolution rule, not the surface. `resolveOrderRef` puts the
owner in the WHERE so a stranger's order number is indistinguishable from one
that was never issued (AUTH-005). A staff member sees every order in the shop,
so there is no owner to scope to and the lookup would become an oracle over the
whole order table keyed by a guessable timestamp. Widening the staff routes
needs its own decision about who may resolve an arbitrary number; it is not part
of CR-1-h.

Consequence on the uni-app side: `api/mappers/order.js` now puts `orderNo` in
`order_id` — the field the pages both print and route on — while
`api/mappers/staff.js` pins it back to the surrogate id for the 商家管理 rows.
`order_no` / `trade_no` are unchanged, and `id` is still the surrogate
everywhere.

### CR-4-h §6 — what 删除订单 writes

`DELETE /api/v1/orders/:id` stamps `orders.hidden_by_user_at` and inserts an
`order_status_logs` row with `change_type = 'hidden_by_user'` and **both**
status columns null. It is a visibility change, not a transition; filling them
in would claim an edge the state machine never made, and B2's timeline renderer
reads `change_type` first.

Every consumer of a buyer-scoped order read already excluded hidden rows through
`liveForUser()` in `order.repo.ts`, so no other query needed touching. Staff and
admin reads never had that predicate and still see everything.

`ORDER_NOT_DELETABLE` is answered only when the order is still visible to this
buyer and still unfinished. A second tap, a stranger's order and an unknown id
are all `ORDER_NOT_FOUND`: after the first tap the order is not in the caller's
list, so any other answer would confirm a row they can no longer see.

### CR-4-h §7 — the invoice line summary is read, never copied

`orderInvoice.orderSummary` is built from `order_items` on the way out, through
the order domain, and is not stored on `order_invoices`. Legacy's
`store_order_invoice` carried its own copy of the lines and drifted from the
order the moment anything was refunded; an int test renames a line's snapshot
and asserts the invoice follows.

One `order_items` query serves a whole page of invoices (`withSummaries`), so
the 发票记录 list did not gain a query per row.

### CR-5-h — one field name, and a staff purpose that needs a page edit

The multipart field is `file`. `readFilePart` used to accept `file`,
`multipart` **or** `image`, which is why the contract could not name one. A file
arriving under another name is now `STORAGE_UPLOAD_FIELD_MISSING` (422) with
`details: { expected, received }`; no file at all is still `STORAGE_NO_FILE`.
Admin and scan-upload routes share the reader and declare the error too.

`purpose=staff` is gated on the same `StaffCheck` that `auth: 'staff'` uses and
fails closed when nothing is registered. It has its own directory
(`uploads/staff/`), its own ceiling (`maxStaffUploadBytes`, 10MB) and its own
budget (`staffUploadsPerHour`, 120) — separate Redis key, so a 店员 adding a
product with eight photos does not lock themselves out of leaving a review.

**Left to stream H2 (one line, in a page this stream may not edit):**
`pages/admin/goods/addGoods.vue` calls
`$util.uploadImageChange({ count: 9, url: 'upload/image' }, …)` twice. Both
should pass `{ count: 9, purpose: 'staff' }`. `uploadPurposeFor` already takes a
caller at its word when it names a contract purpose; until the page is changed
those two uploads still land in `review`, exactly as before, so nothing breaks
in the meantime. The legacy path cannot be used to detect it — 评价 and 订单备注
send the same `upload/image`.

Also stale and H2's: the comment above the thumbnail branch in
`pages/users/user_invoice_list/index.vue` still says the invoice contract has no
line items. It does now (§7), and the template already renders it.

## Two things found on the way, not fixed here

**`scripts/check-api-routes.mjs` cannot see a chained call.** Its regex is
``request\.(get|post|put|patch|delete)\(\s*(['"`])…``, so a call written as
`request` newline `.get(…)` is invisible and the call is proved against nothing. Writing 统计图's two
requests as a promise chain made the live count *fall*. Every call in this
stream is written with `request.get(` adjacent.

**A staff member cannot open a refund detail.** `orderStaff.refundDetail` with a
`{kind: 'staff'}` actor throws `FORBIDDEN` at `refund.admin.ts:81`, because
`rbac.hasPermission` returns false for any actor whose `kind !== 'admin'`. This
is a pre-existing B2 ↔ C seam bug, not caused by this stream; `staffRemark`
deliberately avoids `requirePermission` and works. Filed as `task_44fd273b`.
