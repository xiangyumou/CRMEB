# Stream N1 — Wire the notification calls and the public origin (CR-2-e2, CR-1-e2)

**Worktree** `../CRMEB-wt/ws-n1` · **Branch** `rewrite/ws-n1-notify-wiring` (from `rewrite/integration`) · **Touches, by decision of the orchestrator**: the exact call sites named below in `core/src/{order,refund,payment,catalog,system,notification}`, their tests, `docs/rewrite/status/n1.md`. Nothing else: no contract changes, no admin pages.

Both CRs are accepted. Read `docs/rewrite/cr/CR-2-e2.md` and `CR-1-e2.md` first, then `core/src/notification/index.ts`, `notification.registry.ts` (the events and their `variables`), `notification.effects.ts` (how the eight already-wired events are hooked), and `docs/rewrite/CONVENTIONS.md`.

## 1. CR-2-e2 — six events get a caller
Option **B** (a direct `notify(tx, ctx, …)` call inside the business transaction) everywhere; every one of these has exactly one caller today. Do not add hook registries.

| event | where |
| --- | --- |
| `order_created`, `admin_order_created` | `order/order.checkout.service.ts` `create`, after the order row and items exist, same `tx` |
| `order_price_changed` | `order/order.console.service.ts` 改价, with `oldAmount` |
| `refund_applied`, `admin_refund_applied` | `refund/refund.service.ts` the buyer's apply transaction |
| `refund_approved`, `refund_rejected` | `refund/refund.service.ts` review, rejection reason in `data` |
| `admin_payment_exception` | `payment/` where a `payment_exceptions` row is inserted |
| `admin_low_stock` | `catalog/catalog.stock.ts` `reserve`: after the decrement, for each SKU whose `stock` crossed **from above to at-or-below** the warning threshold (`catalogConfig` — read what A named it); subject `{scope:'sku', id}`; never on every decrement below the line — the ledger deduplicates per subject+event, but do not rely on it for the common case |

Rules from the CR: inside the transaction; `subject` = the aggregate the notification is about; `data` keys = the event's `variables`. `notify` returning `false` is not an error. Add one integration test per call site asserting an effect row of the right event/subject exists after the transaction and none after a rolled-back one (copy the pattern from `notification.int.test.ts`). The existing tests of those services must stay green — notification never fails the business change (NOTIF-001), so a test with no notification templates seeded must still pass.

## 2. CR-1-e2 — the public origin moves to `site`
Add `publicOrigin` and `extraOrigins` to `core/src/system/site.config.ts` exactly as the CR proposes (env-derived default from `PUBLIC_ORIGIN` read through the kit's config field metadata if it supports a read-only/env-sourced field — look at how F1 marks secret/computed fields; otherwise a plain read-only field with a `description` saying it comes from `PUBLIC_ORIGIN`, and the value seeded from the env by `packages/db` seed or the worker/web bootstrap — read `apps/web/src/server/env.ts` and choose the smallest correct mechanism, record it in your status file). No `legacyKeys`. Export `publicOrigin(ctx)` and `isTrustedHost(ctx, host)` from `@shop/core/system`. Then delete `siteBaseUrl` / `jsApiExtraHosts` from the `notification` group and make the notification domain read `system`'s (E2's adapter file says where). E3 will use `isTrustedHost` for the JS-SDK signer — tell it nothing; the orchestrator does.

## Rules
Never push, never SSH, never touch other streams' worktrees; lockfile never. Commit after every unit with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Before the final commit, from `next/`: `pnpm turbo run gen typecheck lint test:unit build`, `pnpm --filter @shop/core test:int`, `pnpm --filter @shop/web test:int`, `pnpm exec prettier --check .`, `pnpm --filter @shop/contracts check:examples`. Final report: call sites wired, tests added, how the origin is sourced, anything left.
