# J1 (order side catches up with H4) — status

Branch `storefront/mini-J1-orders`, worktree `/home/xiangyu/Projects/CRMEB-mini-wt/J1-orders`,
from `storefront/mini` @ 2d7936c9f. Brief: H4's "Client follow-ups" for the order pages, the
presale price defect, 我的评价 status, the receipt foreground fallback.

## Done

1. Presale / 拼团 price on 订单详情 and 我的订单: `lib/order-price.ts` (`orderPrices`) reads each
   line's `adjustments`; the line prints at the activity price, 商品金额 after the activity,
   优惠券 the coupon alone (as the uni-app). Older lines without adjustments: the uni-app's
   fallback (single-line activity order, `userCouponId === null`). `lib/money.ts` now holds
   `toCents`/`fromCents` (aftersale re-exports them).
2. 订单详情: 拼团 → 查看拼团 cell (`groupbuyTeam { id: groupbuyTeamId }`) when non-null.
3. 评价 page shows `reviewable` lines to write and `reviewed` lines as done up front;
   `CATALOG_REVIEW_ALREADY_WRITTEN` still counts as done. 去评价 only while a line is
   `reviewable` (received or completed).

## In progress

- 待评价 tab.

## Pending

- 订单入口 block → `orderList { tab: 'unreviewed' }`; decor.md note.
- 填写退货物流 server search.
- 我的评价 status (contract + service + page).
- Receipt foreground fallback.
- e2e: remove the `test.fail` in `coupons.spec.ts`; e2e-coverage.md row.
- Checklist.

## Page-form changes (旧 → 新)

- 订单详情 / 我的订单: an activity line prints at the price paid (旧 catalogue price and the
  activity lumped into 优惠券).
- 订单详情: a 拼团 order has a 「拼团 · 查看拼团」 row under the status header (旧 none).
- 我的订单 card status: a received or completed order reads 待评价 while a line can still be
  reviewed, else 已完成 (旧 received = 待评价 always, completed = 已完成 always). 去评价 follows
  the same rule, so a completed order inside the review window also gets it.
- 订单详情 received note: 「感谢购买」 once nothing is left to review (旧 always 「…欢迎评价」).
- 评价 page: lines already reviewed show as 「已评价」 up front; everything reviewed → 「已经评价过了」
  result page (旧 the form, refused line by line on submit).

## Backend gaps

- None so far.

## Open questions

- None so far.
