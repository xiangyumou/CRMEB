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
   `useRefetchOnShow(key, { always: true })` refetches them on every show. Tests: 我的
   (`pages/me/index.test.tsx`, with the app's 30 s staleTime), `use-refetch-on-show.test.tsx`.

2. **登录 from 确认订单, 收银台 and 支付结果 came back to 首页.** Their `LoginCard` named no
   `redirect`, so 短信验证码登录 fell back to home (`parseLoginRedirect` → `home`): the checkout
   draft, the order being paid and the payment being confirmed were left behind. They now name
   their own route (`checkout`; `cashier { orderId }`; `payResult { orderId, outTradeNo }`), and
   the login page goes back to them (A3's `loginReturn`). Tests on the three pages.

## In progress

- The rest of the review.

## Pending

- (filled in as the review goes)

## Page-form changes (旧 → 新)

- 我的: the order badges and totals are current every time the tab is shown (旧 up to 30 s old
  after a change made on another page).

- 确认订单 / 收银台 / 支付结果: signing in by SMS on the page comes back to the page (旧 to 首页,
  losing the draft).

## Backend gaps

- None so far.

## Open questions

- None so far.

## Tests for the orchestrator to run

- None so far (unit tests only, run here).
