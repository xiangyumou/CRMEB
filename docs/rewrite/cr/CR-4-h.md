# CR-4-h — gaps the 商家管理 (mobile staff console) still has after B2

- **Stream:** H (uni-app storefront), raised against B2 (fulfilment / staff) and C (refunds)
- **Status:** **resolved** — §1, §2, §6, §7 accepted; §3 rejected; §4 and §5
  out of scope. Stream S: `64485732`, `1d566b96`, `8ae2ebe9`, `f80757d1`,
  `7356c26c`

> **Decisions, section by section.**
>
> 1. **Accepted.** 统计 answers a per-day series, capped at 92 days, bucketed in
>    Asia/Shanghai. One series feeds both the chart and the 详细数据 table, which
>    legacy counted differently and could disagree about the same day.
> 2. **Accepted.** 售后备注 is appended to `refund_logs` — `refunds.staff_remark`
>    does not exist and the schema is frozen — deliberately *not* over the web
>    console's `adminRemark`, so two people remarking cannot erase each other.
> 3. **Rejected.** No 直接退款 from the phone. The refund amount follows the
>    buyer's application and stream C owns the money; the 改价 dialog's 退款金额
>    field is read-only and the approval carries no price.
> 4. **/5. Out of scope.** 配送员 名单 and 电子面单 printing are retired: no
>    successor route, the delivery person's name and phone are typed on the
>    发货 screen. The three call sites are deleted.
> 6. **Accepted.** `DELETE /api/v1/orders/:id` stamps
>    `orders.hidden_by_user_at` on a `completed` / `cancelled` / `refunded`
>    order, conditionally. Hidden orders stay visible to the shop.
> 7. **Accepted.** `orderInvoice.orderSummary` carries the order's first line,
>    read through the order domain rather than copied onto the invoice.
>
> See `docs/rewrite/status/s.md`.
- **Affects:** `next/packages/contracts/src/order/order.staff.contract.ts`,
  `order.fulfil.schemas.ts`

B2's staff contract covers the console's spine, and H is re-pointed onto it: 48
of the module's 51 calls are live. Five screens still have nothing to call, and
one action changed meaning in a way the pages should know about.

## 1. 统计明细 — no per-day breakdown

`pages/admin/statistics/index.vue` draws 今日 / 昨日 / 本月 成交额 as a **chart
over days** and a 详细数据 table of `{time, count, price}` rows.
`staffStatistics` has only the three totals, so the page has no source.

**Ask:** `GET /api/v1/staff/statistics/series?from&to&granularity=day` →
`{items: [{date, orderCount, paidAmount}]}`. The web console's
`orderStatistics` already computes the same numbers over a range; this is the
same query grouped.

**Resolved:** `GET /api/v1/staff/statistics/series`, capped at 92 days. Both
`getStatisticsMonth` and `getStatisticsTime` read it; 增长率 is a second request
for the preceding window, compared in a pure mapper.

## 2. 售后备注 — staff cannot remark a refund

`setAdminRefundRemark` posts a note on a refund from the phone. The web console
has `POST /admin-api/refunds/:id/remark`; the staff surface has no equivalent,
although it *can* remark an order.

**Ask:** `POST /api/v1/staff/refunds/:id/remark` with the same body as the
console's, delegating to C exactly as `staffRefundReview` does.

**Resolved:** the route exists and delegates to C, but *appends to*
`refund_logs` rather than writing the console's `admin_remark`: the schema is
frozen and has no `refunds.staff_remark`, and an append means two people
remarking on one refund cannot erase each other.

## 3. 「直接退款」 has no successor — and that is probably right

Legacy let a staff member type **any** amount and refund it, with no application
from the buyer (`admin/order/refund`). The new model has C refund what was
applied for, so `setOrderRefund` is now re-pointed at
`POST /api/v1/staff/refunds/:id/review` and the typed amount is dropped: 同意
refunds the applied amount, 拒绝 needs a reason.

This is recorded rather than asked for — **if** an operator-initiated refund is
wanted on the phone, it needs a route and a decision about who may create a
refund nobody applied for. H's assumption is that it is not wanted, and the
「退款」 modal's amount box is therefore inert.

## 4. 配送员列表 (送货 mode)

`shipBody`'s `merchant_delivery` takes a typed `courierName` / `courierPhone`.
The page picks the courier from a list the shop configures
(`orderOrderDelivery`), which no longer exists, and it refuses to submit when
the list is empty ("请在平台后台添加送货人").

**Ask:** either `GET /api/v1/staff/couriers` → `{items: [{id, name, phone}]}`,
or a ruling that 送货 is typed in by hand — in which case H removes the picker.

**Resolved:** 送货 is typed in by hand. The picker and the empty-list guard are
deleted; `orderOrderDelivery` is gone.

## 5. 电子面单 (waybill printing)

`orderExportTemp` / `orderDeliveryInfo` drive the 电子面单 branch of the 发货
form. Both need a logistics provider, which is F2's and is not landed.

**Resolved:** out of scope, and the branch is deleted along with
`orderExportTemp` / `orderDeliveryInfo`. The 快递 branch of the form (company +
tracking number, typed) is live and is the one that matters.

## 6. 删除订单 (buyer hides a finished order)

`orderDel` is the 我的订单 「删除订单」 button — legacy's `is_del`, a per-user
hide, not a real delete. `orderChangeType` includes `hidden_by_user`, so the
concept survived, but no storefront route writes it.

**Ask:** `DELETE /api/v1/orders/:id` (or `POST /api/v1/orders/:id/hide`),
allowed on `completed` / `cancelled` / fully-refunded orders only.

**Resolved:** `DELETE /api/v1/orders/:id` exists and the marker is gone.

## 7. 发票记录 shows no goods

`orderInvoice` carries `orderNo` and `amount` but no line items, and the 发票
记录 row renders the order's first product thumbnail. H guarded the template and
falls back to the order number, which is a visible downgrade.

**Ask:** either embed `{productName, productImageUrl}` of the first line on
`orderInvoice`, or let the list be `?expand=order`. Low priority.

**Resolved:** embedded, as `orderInvoice.orderSummary` — the first line's name,
image and spec, its quantity, and the line and unit counts. It is read from
`order_items` on the way out rather than copied onto `order_invoices`, which is
what made legacy's `store_order_invoice` drift from the order it described.
