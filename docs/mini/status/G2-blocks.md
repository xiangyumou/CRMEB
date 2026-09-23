# G2 — DIY blocks, batch 2: status

Branch `storefront/mini-G2-blocks` (from `storefront/mini`). Updated at every commit so the work can
resume after an interruption.

Baseline mini build before G2 (`pnpm --filter @shop/mini build:weapp`, production weapp, demo
package excluded): main 501.2 KB, goods 6.4, order 83.8, aftersale 68.0, promo 12.9, account 27.4,
content 4.8, page 1.6, total 706.1 KB; react ×1; no zod.

Blocks: `couponList` 优惠券, `newcomerCoupon` 新人券, `groupbuyList` 拼团, `presaleList` 预售,
`articleList` 资讯, `video` 视频, `floatingContact` 悬浮客服, `followOfficialAccount` 关注公众号.

## Done

- **Contracts** (`packages/contracts/src/decor/`):
  - Block files: `coupon-list.ts`, `newcomer-coupon.ts`, `campaign-list.ts` (拼团 + 预售),
    `article-list.ts`, `video.ts`, `floating-contact.ts`, `follow-official-account.ts`, shared
    `list-heading.ts` (title + 「更多」). Registered in `all-blocks.ts`.
  - `constants.ts` (zod-free): `COUPON_LIST_LAYOUTS`, `CAMPAIGN_LIST_LAYOUTS`,
    `ARTICLE_LIST_LAYOUTS`, `VIDEO_RATIOS`, `FLOATING_SIDES`, `FLOATING_BOTTOM`.
  - `meta.ts`: field kind `video`.
  - `sources.ts`: personal need `newcomerCoupons { limit }`, slot `{ kind: 'newcomerCoupons',
coupons: HeldCoupon[] }`.
  - `floatingContact` and `followOfficialAccount` are `maxPerPage: 1` (DECOR-018).
  - `examples.ts`: one example per new block. Tests in `blocks.test.ts` ("the batch-2 blocks").
- **Core**:
  - `groupbuy.cardsFor(ctx, ids)` / `presale.cardsFor(ctx, ids)`: additive, read-only; the same
    visibility as `list`, in the given order, one query (repo `listActivities` gained an additive
    `ids` filter). Used by the decor resolvers and the reference checker instead of reading one
    list page of 100 and picking — the 100-campaign limit is gone. Int tests in both domains.
  - `coupon.listHeldNewUser(ctx, limit)` (repo `listUnusedBySource`): additive, read-only, tested.
  - `decor-resolve.service.ts`: the `newcomerCoupons` personal need, fetched once per request
    (largest limit, capped at 10), never cached.
  - `decor.int.test.ts` "the batch-2 blocks (G2)": 8 tests (DECOR-004/013/015/018).
- **Docs**: `docs/invariants.md` DECOR-015 text + citations, DECOR-013/004 citations, new DECOR-018.
- **storefront-blocks**: components `coupon-list`, `newcomer-coupon`, `campaign-list`
  (`groupbuy-list`, `presale-list`, shared `campaign-cards`), `article-list`, `video`,
  `floating-contact`, `follow-official-account`; all in `BLOCK_COMPONENTS`.
  - `BlockIntent` gains `claimCoupon { templateId }`, `claimNewcomerCoupons`, `officialAccount`.
  - `BlockProps.host` / `BlockListProps.host` (`BlockHost`: `signedIn`, `serverNow`, `canvas`,
    `overlayOpen`); `BlockList` derives `signedIn` from `personal`.
  - Shared: `list-head.tsx` (title + 更多), `time.ts` (Beijing-time dates, countdown, phase),
    `money.ts`, `personal.ts` (`couponStatesIn`, `heldCouponsIn`), tokens `$shadow-float`,
    `$z-bar`, icon `contact`.
  - DOM shim: `Video` (300×225, contained, autoplay only muted).
  - Fixtures for every new block (`FIXTURE_NOW` / `fixtureServerNow` for the countdown,
    `fixturePersonalG2`). Tests: `marketing-blocks.test.tsx` (27 × React 18 + 19), registry test.

## In progress

- Admin: video field, canvas flag.

## Next

- Admin canvas data, templates, spike page; mini demo page; fidelity; decor.md; checklist.

## Notes

- Presales are full-payment only (the domain refuses a 定金 campaign), so the 预售 block shows the
  预售价 and 发货 days, not deposit / balance.
- The storefront presale list only shows campaigns inside their window, so the block's
  「距开始」 phase is only reachable in the editor canvas or a stale page; it is still handled.
