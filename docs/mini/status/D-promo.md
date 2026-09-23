# D (promo pages, share and poster) — status

Branch `storefront/mini-D-promo`, worktree `/home/xiangyu/Projects/CRMEB-mini-wt/D-promo`.
Brief: 拼团 (list, activity, team, 我的拼团), 预售 (list, detail), 优惠券 (领券中心, 我的优惠券),
share handlers, 小程序码 + scene decode, canvas-2D poster, e2e journeys.

`storefront/mini` (with A2, B and C) merged in.

## Done

- Pure promo logic with tests: `features/groupbuy/team.ts` (team phase open / settling / full /
  failed / refunded / cancelled, headline, actions, 我的拼团 status), `features/coupon/claim-state.ts`
  (claimable / claimed / limit / sold-out / closed), `features/promo/activity.ts` (activity phase,
  real-deadline countdown target, 预售 ship text).
- `platform/scene.test.ts`: every `miniCode` key (article, couponCenter, groupbuy, groupbuyTeam,
  home, page, presale, product) → `encodeScene` → `decodeEnter` → the same route; share path
  equals the server's `toMiniPath`.

- Poster: `features/share/poster-layout.ts` (pure layout → draw ops, tested), `platform/poster.ts`
  (canvas 2D node, `downloadFile`, `canvasToTempFilePath`, `saveImageToPhotosAlbum`,
  `openSetting`) with `platform/poster.h5.ts` (DOM canvas, download link) and
  `platform/poster-draw.ts` (the shared replay); `features/share/poster-sheet.tsx` (drawing /
  ready / saving / saved / denied → 去设置 / failed → 重试, 「不显示商品图片」) and
  `features/share/share-sheet.tsx` (分享给好友 + 生成海报). Taro fake gained the album, setting,
  selector-query and canvas APIs; `fake-api.ts` took B's `query` change verbatim (merges clean).

## In progress

- `docs/mini/pages.md` §2.5 rows and a 「D 流」 form-change list written.

- Pages done with tests: 领券中心, 我的优惠券, 我的拼团, 拼团 list, 拼团商品 (activity), 拼团进度
  (team page), 预售 list, 预售商品. Every promo page is built.
- Activity checkout: `features/promo/checkout.ts` builds B's `CheckoutDraft` (`buy-now` item +
  `kind` / `kindMeta`, `groupId` when joining).
- B's poster stub replaced: `features/share/poster.tsx` keeps B's `openPoster` / `posterAvailable`
  and adds `PosterHost`, which 商品详情 renders; a guest is sent to log in first. Tests on
  商品详情 for both.
- Decor pages (首页, 微页面), 分类, 商品列表, 精品推荐 and every promo page share; each page's
  `enableShareAppMessage` matches its `useShare`.
- e2e: `e2e/storefront/src/mini-pages/promo-pages.ts` page objects; `specs-mini/promo.spec.ts`
  (four journeys) being run.

## Next

1. Run and settle `specs-mini/promo.spec.ts`.
2. 375px screenshots, checklist.

## Decisions

- Activity pages are the promo sub-package's own `groupbuy-detail` / `presale-detail` (already in
  the catalogue), not B's 商品详情: the two pages share no code with B's page but the SkuSheet.
- Activity pages use their own flat SKU sheet (`features/promo/activity-sku-sheet.tsx`): the
  activity SKUs come as a flat list with `specText`, not the product's spec matrix.
- 拼团商品 lists open teams by seats and time left only (no leader name or avatar); 去参团 opens
  the team page, where the SKU is picked.
- 拼团进度 shows members as taken seats (团长 / 已参团), never by nickname or avatar: the page is
  shared outside the shop. Invite = WeChat share or the poster (badge 「N 人团 · 还差 N 人成团」).
- 预售 pages say 「全款预订」 and 「无需另付尾款」: the backend sells presale in full only.
- The 拼团 list shows the participant count only; `groupbuy.summary.avatars` are not drawn (a
  shopper's face beside this shop's products does not belong on a public page).

## Backend gaps (for the report)

- `catalog.productList` has no `couponId` filter (B noted it too).
- 预售 is full payment only (`PRESALE_DEPOSIT_NOT_SUPPORTED`): no deposit / balance window.
- `app/config` has no switch for product-poster sharing.
- `groupbuy.banners[].link` is a legacy path string, not a `LinkTarget` (only a link that decodes
  to a catalogue route is tappable).
- The order detail does not name its group (`groupId`): the team is found through
  `groupbuy.myGroups` by `orderId`.
