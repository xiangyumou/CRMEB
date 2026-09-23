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

## In progress

- 2: per-line review state.

## Client follow-ups

- 订单详情: 查看拼团 → `{ route: 'groupbuyTeam', params: { id: order.groupbuyTeamId } }` when
  `groupbuyTeamId !== null`.
