# K3 (mini client correctness review) — status

Branch `storefront/mini-K3-client-review`, worktree `/home/user/wt/K3-client-review`, from
`storefront/mini` @ f0a0b50. Brief: `docs/mini/next-tasks.md` § K3-client-review (defects where the
pieces meet: cache and badges, money, double submits, navigation, states, timers, countdowns,
login return, guest browsing, copy). Updated at every commit.

## Done

1. **我的 counts after a change elsewhere.** 我的 refetched `decor.pageUserCenter` (order badges,
   coupon / 收藏 / 足迹 totals, nickname and avatar) and the unread count on show only once they
   were stale (30 s). Paying, cancelling, confirming receipt, applying for a refund, reviewing,
   claiming or editing the profile within 30 s of the last look left the old badges. Now
   `useRefetchOnShow(key, { when: 'always' })` refetches them on every show. Tests: 我的
   (`pages/me/index.test.tsx`, with the app's 30 s staleTime), `use-refetch-on-show.test.tsx`.

2. **登录 from 确认订单, 收银台 and 支付结果 came back to 首页.** Their `LoginCard` named no
   `redirect`, so 短信验证码登录 fell back to home (`parseLoginRedirect` → `home`): the checkout
   draft, the order being paid and the payment being confirmed were left behind. They now name
   their own route (`checkout`; `cashier { orderId }`; `payResult { orderId, outTradeNo }`), and
   the login page goes back to them (A3's `loginReturn`). Tests on the three pages.

3. **A first address added from 确认订单.** The address form invalidated the address reads
   only; 确认订单 underneath (priced against the default address) stayed fresh for 30 s, still
   said 「请先添加收货地址」 and 提交订单 opened the sheet again. `ADDRESS_READS`
   (`data/stale-reads.ts`) adds `order.checkoutPreview`; 收货地址 uses it too. Test:
   `address-edit/index.test.tsx`.
4. **A claimed coupon elsewhere.** `coupon.claim` (领券中心, 商品详情 领券, the decor 优惠券 block)
   dropped the coupon lists and the wallet only: 首页 / 微页面 kept 「领取」 for as long as they
   stayed mounted (首页 never refetched on show), 我的 kept the old coupon total, and the cart's
   hint missed the new coupon. `features/coupon/use-claim.ts` `useClaimCoupon` is now the one
   claim mutation: `COUPON_READS` (+ `coupon.applicableList`) and `markStale` on the decorated
   pages (no fetch while hidden). 首页 and 微页面 fetch a copy a change marked stale when shown
   (`useRefetchOnShow(key, { when: 'invalidated' })`, so an unchanged 首页 is not refetched every
   30 s). Tests: 领券中心, 首页, `use-refetch-on-show.test.tsx`.
5. **Smaller invalidation gaps**, each with a test:
   - 取消订单 puts the coupon back (`coupon.release`): `coupon.myList` is dropped too.
   - 提交订单 takes the coupon out of the wallet: `coupon.myList` is dropped too.
   - 支付成功 drops `groupbuy.groupDetail` / `groupbuy.myGroups` (the seat is taken) with the
     order reads.
   - 商品详情 收藏 / 取消收藏 drop `catalog.favoriteList` (我的收藏 may be under the page).
   - 搜索 asks for the history on every visit (`refetchOnMount: 'always'`): the last search added
     to it on the server, and the 30 s cache showed the list without it.

## In progress

- The rest of the review.

## Pending

- (filled in as the review goes)

## Page-form changes (旧 → 新)

- 我的: the order badges and totals are current every time the tab is shown (旧 up to 30 s old
  after a change made on another page).

- 确认订单 / 收银台 / 支付结果: signing in by SMS on the page comes back to the page (旧 to 首页,
  losing the draft).
- 首页 / 微页面 / 我的: a coupon claimed on another page shows as claimed when the shopper comes
  back (旧 「领取」 until the page was pulled down or reopened).
- 确认订单: back from adding the first address, the address is there (旧 「请先添加收货地址」
  for up to 30 s).
- 搜索: the history includes the last search (旧 up to 30 s behind).

## Backend gaps

- None so far.

## Open questions

- None so far.

## Tests for the orchestrator to run

- None so far (unit tests only, run here).
