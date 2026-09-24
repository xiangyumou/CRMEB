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

## In progress

- The rest of the review.

## Pending

- (filled in as the review goes)

## Page-form changes (旧 → 新)

- 我的: the order badges and totals are current every time the tab is shown (旧 up to 30 s old
  after a change made on another page).

## Backend gaps

- None so far.

## Open questions

- None so far.

## Tests for the orchestrator to run

- None so far (unit tests only, run here).
