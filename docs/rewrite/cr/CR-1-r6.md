# CR-1-r6 — the staff surface cannot learn which staff switches are on

- **Stream:** R6 (what H4 found), while doing brief §4 ("the uni-app staff 售后 screen follows
  `allowStaffRefundReview`"). Raised against `contracts/src/order/order.fulfil.schemas.ts`
  (`staffIdentity`) and `core/src/order/order.staff.service.ts` (`me`). The orchestrator routes it.
- **Status:** **RESOLVED** at R6's merge by the orchestrator: `staffIdentity.abilities` is served by `order.staff.service.ts` `me`, pinned by `apps/web/app/api/v1/staff/refunds/refunds-staff.int.test.ts` › `GET /api/v1/staff/me — abilities (CR-1-r6)`. Gating 改价 on the phone stays undone (outside §4; post-cutover backlog).
- **Severity:** low. With `order-staff.allowStaffRefundReview` off (its default), a staff member
  sees 退款审核 / 确认收货 on the phone, taps them and gets a 403 `店员审核售后未开启`. Nothing is
  written. The same holds for 改价 and `allowStaffRepricing`.

## What is missing

R2 put staff 同意 / 拒绝 behind `order-staff.allowStaffRefundReview` (CR-14-k), and 改价 was
already behind `order-staff.allowStaffRepricing`. Both switches are read only inside the staff
service, where the request is refused. No response carries either switch to the app:

- `GET /api/v1/staff/me` (`staffIdentity`) answers `{ isStaff, userId, nickname }`.
- The refund reads answer C's `adminRefundDetail` / `pagedAdminRefunds` unchanged. These are the
  console's shapes, so a staff-only field does not belong on them.
- `GET /api/v1/site/config` is public. Staff switches have no business there.

The brief said to read the switch "from wherever the staff surface already learns its switches".
Nothing teaches it any, so this is the smallest contract addition that would.

## Proposal (additive)

`staffIdentity` gains one field:

```ts
/**
 * What this staff member may do from the phone. It follows the `order-staff`
 * group. All false for someone who is not staff.
 */
abilities: z.object({
  /** `order-staff.allowStaffRefundReview` — 退款审核 / 确认收货. */
  refundReview: z.boolean(),
  /** `order-staff.allowStaffRepricing` — 改价. */
  adjustPrice: z.boolean(),
}),
```

`order.staff.service.ts` `me` reads `orderStaffConfig` once, the same `ctx.config.get` that
`adjustPrice` and `reviewRefund` already call. It returns both flags when `isStaff`, and both
`false` otherwise. The two `staffMe` examples gain the field (`is-staff`:
`{ refundReview: false, adjustPrice: false }`, the defaults). An int test beside
`refunds-staff.int.test.ts` sets the switch and reads it back.

## What R6 already did on the app side

The uni-app reads the proposed field, so resolving this CR means changing only the server:

- `template/uni-app/api/mappers/staff.js` `toLegacyStaffIdentity` maps
  `abilities.refundReview === true` (and `isStaff`) to `refund_review: 1`. Anything else maps to
  `0`, including a server that does not send the field yet. `0` is the switch's own default.
- `pages/admin/refund_order_list` and `pages/admin/refund_order_detail` call `getStaffIdentity()`
  on load and show 退款审核 / 确认收货 only when `refund_review === 1`.
- `tests/mappers.staff.test.mjs` › `refund_review — the 售后 screens follow allowStaffRefundReview`
  pins it.

Until the server sends `abilities`, a shop that **turned the switch on** also loses the buttons on
the phone. The web console still reviews. Before R2 no shop could review from the phone at all, so
nothing that worked before R2 is lost.

Not done: gating 改价 on `adjustPrice`. It is the same shape of change on `pages/admin/orderList`,
`pages/admin/orderDetail` and `components/PriceChange`, and it is outside §4.
