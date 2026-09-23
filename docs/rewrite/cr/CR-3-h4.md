# CR-3-h4 — 立即成团 completes a team without saying so

- **Stream:** H4 (storefront follow-up), raised against the group-buy domain (D ownership:
  `next/packages/core/src/groupbuy/**`). The orchestrator routes it.
- **Status:** **RESOLVED** by R6 in `6f619b173` — `adminGroupComplete` records the `groupbuy.settle` effect (`manual: true`) in the completing transaction
- **Found on:** `rewrite/ws-h4-storefront-followup`, while checking SMOKE-012 (§6).
- **Severity:** the leader and members of a team an operator completes by hand never get the
  拼团成功 notice, once E2 hangs one off `groupbuy.settle`. The team itself is completed correctly.

## What happens

A team reaches `succeeded` three ways, and each should leave exactly one `groupbuy.settle` effect
(`groupbuy.effects.ts` documents it as "a team succeeded or failed"):

| path                                | where                                                                  | records `groupbuy.settle` |
| ----------------------------------- | ---------------------------------------------------------------------- | ------------------------- |
| the last seat is paid               | `groupbuy.order.ts` `handlePaid` → `succeedGroup`                      | yes (`virtual: false`)    |
| the timer runs out with 虚拟成团 on | `groupbuy.jobs.ts` `settleGroup` → `virtuallyFillAndSucceed`           | yes (`virtual: true`)     |
| an operator presses 立即成团        | `groupbuy.service.ts` `adminGroupComplete` → `virtuallyFillAndSucceed` | **no**                    |

`adminGroupComplete` makes the same update as the timer path and logs it, but records no effect.

## Ask

In `adminGroupComplete`, after `filled.won`, record the same effect the timer path does:
`{ scope: 'groupbuy', scopeId: String(id), eventType: 'groupbuy.settle', payload: { groupId,
outcome: 'succeeded', virtual: true } }`. Adding `manual: true` is optional; E2 may want to word
the notice differently.

## Proof

`next/packages/core/src/groupbuy/groupbuy.smoke.int.test.ts` › `CR-3-h4 — 立即成团 says so` ›
`records one groupbuy.settle effect when an operator completes a team` is an `it.fails`. It opens
a one-seat-taken team through the real checkout, turns 虚拟成团 on, and completes the team as an
operator. It fails today with `expected [] to have a length of 1`. With the fix, flip it to `it`.
