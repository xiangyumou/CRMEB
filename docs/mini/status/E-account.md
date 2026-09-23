# Stream E — account and content pages (status)

Worktree `CRMEB-mini-wt/E-account`, branch `storefront/mini-E-account` (from `storefront/mini`).
Updated at every commit so the work can resume after an interruption.

## Done

- Orientation: contracts, UI kit, session, platform seam, B's `DecorPage` (not merged yet).

## In progress

- `catalog.myReviews` gains `status` (additive contract fix, for 我的评价's 待审核).

## Next

1. Platform helper `chooseInvoiceTitle`; `features/checkout/address-choice.ts`.
2. account: 个人资料, 设置, 手机号, 修改密码, 找回密码.
3. 地址列表 (select mode) / 地址编辑 (RegionPicker, 导入微信地址); checkout reads the choice.
4. 收藏, 浏览记录, 我的评价; 消息列表 / 详情.
5. 发票: 抬头 list / edit (微信导入), 开票记录 / 详情, 申请开票.
6. 注销账号; 协议 page (`pages/agreement`).
7. content: 资讯列表 / 详情, web-view (C12).
8. 我的 tab: user-centre decor through a local renderer until B's `DecorPage` lands.
9. Vitest per page; e2e specs in `e2e/storefront/specs-mini`; `docs/mini/pages.md`; screenshots
   in `docs/mini/status/E-screens/`; checklist; sizes.

## Backend gaps found

- `catalog.myReviews` returned no status, though the list includes 待审核 and hidden rows.
