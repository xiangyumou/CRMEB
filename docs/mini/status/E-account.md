# Stream E — account and content pages (status)

Worktree `CRMEB-mini-wt/E-account`, branch `storefront/mini-E-account` (from `storefront/mini`).
Updated at every commit so the work can resume after an interruption.

## Done

- Orientation: contracts, UI kit, session, platform seam, B's `DecorPage` (not merged yet).
- `catalog.myReviews` gains `status` (additive contract fix, for 我的评价's 待审核).
- `platform/invoice-title{,.h5}.ts` + `invoice-title-map.ts` (`chooseInvoiceTitle`, 模拟小程序
  answers the harness's `invoiceTitle`); the Taro fake gained `chooseInvoiceTitle`.
- `features/checkout/address-choice.ts` (the address picked in select mode).
- `packages/account/shared` (SubmitBar, error helpers, SMS, password rules), `src/test/account-fixture.ts`.
- 个人资料 (chooseAvatar + nickname input, C09 field error), 设置, 手机号 (bind WeChat / SMS,
  change by SMS), 修改密码 (old password or SMS; silent re-sign-in), 找回密码. Tests.
- 收货地址 (导入微信地址: saved in one tap when the region resolves against the city tree,
  else handed to the form; select mode writes `address-choice` and goes back; 默认, 编辑,
  删除) and 新增 / 编辑地址 (RegionPicker, import, 默认). S4's checkout (stream B's page) got a
  minimal hook: tapping the address opens select mode, the preview/create body sends
  `addressId`. Tests.

- 我的收藏 / 浏览记录 (管理 mode, batch 取消收藏 / 删除, 清空; history grouped by day) and 我的评价
  (stars, pictures, reply; 待审核 as a neutral 「审核后展示」). Tests.
- 消息中心 (a `data.route` opens that page and marks read; else 消息详情; 全部已读; 删除) and
  消息详情 (marks read once shown; 查看详情 when routed; 删除). Tests.

## In progress

- 发票: 抬头 list / edit (微信导入), 开票记录 / 详情, 申请开票.

## Next

3. 注销账号; 协议 page (`pages/agreement`).
4. content: 资讯列表 / 详情, web-view (C12).
5. 我的 tab: user-centre decor through a local renderer until B's `DecorPage` lands.
6. e2e specs in `e2e/storefront/specs-mini`; `docs/mini/pages.md`; screenshots in
   `docs/mini/status/E-screens/`; checklist; sizes.

## Backend gaps found

- `catalog.myReviews` returned no status, though the list includes 待审核 and hidden rows.
