# D (promo pages, share and poster) — status

Branch `storefront/mini-D-promo`, worktree `/home/xiangyu/Projects/CRMEB-mini-wt/D-promo`.
Brief: 拼团 (list, activity, team, 我的拼团), 预售 (list, detail), 优惠券 (领券中心, 我的优惠券),
share handlers, 小程序码 + scene decode, canvas-2D poster, e2e journeys.

B (`storefront/mini-B-shopping`: SkuSheet, checkout `kindMeta`, poster stub) is **not merged**
into `storefront/mini` yet. Until it is, the activity pages hand checkout what S4's draft takes.

## Done

- Pure promo logic with tests: `features/groupbuy/team.ts` (team phase open / settling / full /
  failed / refunded / cancelled, headline, actions, 我的拼团 status), `features/coupon/claim-state.ts`
  (claimable / claimed / limit / sold-out / closed), `features/promo/activity.ts` (activity phase,
  real-deadline countdown target, 预售 ship text).
- `platform/scene.test.ts`: every `miniCode` key (article, couponCenter, groupbuy, groupbuyTeam,
  home, page, presale, product) → `encodeScene` → `decodeEnter` → the same route; share path
  equals the server's `toMiniPath`.

## In progress

- `platform/poster.ts` + `features/share`.

## Next

1. (poster, see above)
2. `platform/poster.ts` + `features/share` (layout, PosterSheet, ShareSheet).
3. Pages: coupons, my-coupons, my-groupbuys, groupbuy, groupbuy-team, groupbuy-detail, presale,
   presale-detail.
4. After B merges: SkuSheet + checkout `kindMeta`, replace B's poster stub.
5. e2e specs-mini, pages.md, screenshots, checklist.

## Decisions

- Activity pages are the promo sub-package's own `groupbuy-detail` / `presale-detail` (already in
  the catalogue), not B's 商品详情: the two pages share no code with B's page but the SkuSheet.

## Backend gaps (for the report)

- `catalog.productList` has no `couponId` filter (B noted it too).
- 预售 is full payment only (`PRESALE_DEPOSIT_NOT_SUPPORTED`): no deposit / balance window.
- `app/config` has no switch for product-poster sharing.
- `groupbuy.banners[].link` is a legacy path string, not a `LinkTarget`.
- The order detail does not name its group (`groupId`): the team is found through
  `groupbuy.myGroups` by `orderId`.
