# H4 (backend follow-ups, contract owner) — status

Branch `storefront/mini-H4-backend`, worktree `/home/xiangyu/Projects/CRMEB-mini-wt/H4-backend`.
Brief: read-side additions for the order/after-sales pages (stream C's "Backend gaps"): the
拼团 team id on the order detail → per-line review state → 待评价 count → express-company
search → the rest of C's gaps → merge checklist.

## Done

1. `order.detail` (and every answer shaped like it: `order.create`, `order.cancel`,
   `order.confirmReceipt`) carries `groupbuyTeamId: id | null`, the team the order opened or
   joined. Read through a new optional `OrderKindHandler.detailLinks(db, orderId)` port method
   (group buy answers from its membership row), so the order domain still never reads a
   `groupbuy_*` table. ORDER-011.

2. Per-line review state on the shopper's own lines: `order.list` and `order.detail` items are
   now `storefrontOrderItem` = `orderItem` + `reviewed` (any review row: published, 待审核, or
   removed by the shop — each makes a second one `CATALOG_REVIEW_ALREADY_WRITTEN`) +
   `reviewable` (exactly what `catalog.reviewSubmit` accepts: order `received`/`completed`,
   line not refunded in full, not reviewed). The console keeps the plain `orderItem`
   (`adminOrderListItem` extends the unchanged `orderListItem`). ORDER-010.

## In progress

- 3: 待评价 count.

## Client follow-ups

- 订单详情: 查看拼团 → `{ route: 'groupbuyTeam', params: { id: order.groupbuyTeamId } }` when
  `groupbuyTeamId !== null`.
- 评价 page: `reviewableLines` → `order.items.filter((item) => item.reviewable && …)`; lines with
  `reviewed` can show as done up front; keep treating `CATALOG_REVIEW_ALREADY_WRITTEN` as done
  (a race with another device). 我的订单 card: show 评价 only when some line is `reviewable`.
- Test fixtures: `apps/mini/src/test/order-fixtures.ts` items default to
  `reviewed: false, reviewable: false`, details to `groupbuyTeamId: null`.
