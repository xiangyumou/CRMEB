# Wave 6 — the K2 findings (streams R1–R4)

K2 (`docs/rewrite/status/k2.md`, merged 2026-09-23) re-read the AUDIT as an attacker, ran the fixed-seed sequence, the mutants, ten shuffled concurrency rounds and a load smoke, and filed CR-1…53-k2. Every owning stream has merged, so the orchestrator routes them here, together with the K1 CRs that K2 found still open. Four streams, split by directory so they can run at once. Each stream reads **this file's common rules**, then its own section.

## Common rules (all four)

- **Worktree** `../CRMEB-wt/ws-r<n>` · **Branch** `rewrite/ws-r<n>-<slug>` (cut by the orchestrator from `rewrite/integration`). Work only there. Never push, never SSH, never modify `crmeb/`, `template/**`, or another stream's worktree.
- **Every CR file is the spec.** Read it in full; implement its "Asked for" section unless this brief decides otherwise. Where K2 pinned the defect as `it.fails` / `test.fails`, the fix is done when that test is flipped to `it` / `test` and passes; do not rename pinned tests (the ledger and `mutations.ts` reference them by title) unless the CR tells you to. Mark each CR file **RESOLVED** with the commit when done; a CR you conclude should not be done as asked is answered in the file with the reason and left for the orchestrator.
- **Ownership** is listed per stream. Anything outside it is read-only; if a fix needs it, write `docs/rewrite/cr/CR-<n>-r<n>.md` to the orchestrator and move on. `invariants.md` and `STATUS.md` stay the orchestrator's: put ledger text you want applied in your status file.
- **No real WeChat / SMS / Aliyun calls**; fakes from `@shop/testing` only. Load only against the local stack.
- Commit after every CR (or tightly related pair) with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Keep `docs/rewrite/status/r<n>.md` as you go: per CR the change, the tests flipped/added, and anything left.
- Do not spawn sub-agents unless the orchestrator tells you to (the project-wide cap is 5 concurrent agents and four streams already run). If you ever do, omit the `model` parameter.
- Other streams build in sibling worktrees: mass `ERR_CONNECTION_REFUSED` / OOM-killed builds / Testcontainers timeouts are contention; rerun when load drops.
- **Done (every stream):** from `next/`: `pnpm turbo run gen typecheck lint test:unit build`, `pnpm turbo run test:int --force --concurrency=4`, `pnpm exec prettier --check .`, `pnpm --filter @shop/contracts check:examples`, `pnpm guards` (0 failures; pending only on streams still in flight), and — if you touched admin pages or `apps/web` server code — rebuild web and run `pnpm --filter @shop/e2e-admin e2e`. Final report: per CR its status and commit, tests flipped/added, ledger text for the orchestrator, the final commit hash and merge-time notes.

## R1 — reliability (STAB-001 to 10/10)

**Branch** `rewrite/ws-r1-reliability`. **Owns** `next/packages/core/src/catalog/**`, `next/packages/core/src/sms/**`, `next/packages/core/src/notification/notification.send.ts` (+ its tests), the concurrency test files named below, `next/apps/worker/**`, `next/apps/web/src/server/health.ts` (+ tests) for the backlog detail, and — **granted for this stream only** — `next/packages/core/src/kernel/{config*,effects*}` and the pool options in `next/packages/db/src/**` (no schema, no migration), and `next/guards/**` for the new check and the mutation pointer.

In this order:
1. **CR-53-k2 (high)** — all three parts: (1) no second pooled connection while a lock is held — add `config.getIn(tx, group)` (reads through the caller's transaction on a cache miss) or hoist the read before the lock, and fix `notification.send.ts` the same way; flip the pin (`catalog.stock.pool.int.test.ts`); (2) a new guard check that flags `ctx.config.get(` / `ctx.db` inside a function taking a `tx`, with an exact-compared allow-list; (3) `connectionTimeoutMillis` (a few seconds, env-overridable) on the pool and `idle_in_transaction_session_timeout` (30 s) as a connection option — prove the hang becomes an error with a test.
2. **CR-50-k2** — the resend guard becomes the write (`SET NX PX` first), as the CR sketches. Flip `sms.resend-race.int.test.ts`.
3. **CR-51-k2** — COUPON-008's limit-above-one test asserts the invariant, as the CR writes it (`coupon/coupon.concurrency.int.test.ts` only; no coupon production code).
4. **CR-40-k2** — items 1, 2 and 4 (drain while a full batch is claimed, inside a time budget; oldest-due-pending age in the log line and as a `readyz` detail that never fails the check; a fake-clock test). Item 3 only if trivial.
5. **CR-41-k2** — option 1: no synchronous `UPDATE products SET views` on the request path; a worker job folds `product_events` into `products.views` in batches; plus the concurrency test from item 3.
6. **CR-23-k2** — option 1: delete catalog's unused virtual-card copy and its tests, fix the port table, point MUT-001's `virtual-card-claim` entry at B2's `autoDeliver` claim, and re-run `pnpm --filter @shop/guards mutations` (10/10 killed).
7. **STAB-001** — ten consecutive shuffled rounds of the set (the corrected `concurrency-soak` step in `.github/workflows/next.yml` shows the exact command; seeds 1–10) with **no failure**. If groupbuy leadership recurs, it is real: fix it if it is in your ownership, else CR. Record every round in the status and give the orchestrator the STAB-001 row text (`ported`, with the test-set ids or the soak command as its proof, the way MUT-001 names its script).

## R2 — payment, refund, order

**Branch** `rewrite/ws-r2-payments`. **Owns** `next/packages/core/src/{order,payment,refund}/**`, `next/packages/contracts/src/{order,payment,refund}/**`, their routes and route tests under `next/apps/web/app/{api,admin-api}/**` (orders, payments, refunds, webhooks, staff refunds), the admin refund pages under `next/apps/web/src/admin/**` (not `kit/`). Read-only: `core/order/ports.ts` (orchestrator) — if a port signature must change, CR it.

1. **CR-1-k2** — register the paid hook in the **order** domain (it calls `resolveStockPort().commit(tx, orderId, lines)`), ordered before `groupbuy:take-seat` and `presale:commit-sale`; presale orders are committed by this hook too and `presale:commit-sale` must not double-count (the ledger key already makes it a no-op — assert it). Flip the pin; tighten SEQ-001's INV5 back to `sales == sold`.
2. **CR-2-k2** — option 1: log-only handlers for `order.paid` / `order.refunded` (the `presale.effects.ts` pattern). Flip the pin.
3. **CR-3-k2, CR-4-k2, CR-5-k2** — webhook event-type routing, `mchid` match, refund amount check, each raising an operator exception as the CRs say and answering 200. Flip the pins.
4. **CR-6-k2** — drop `detail` from `refund/index.ts`'s exports.
5. **CR-21-k2's neighbouring gap** for the **refund** client: the same untrusted-certificate fixture pointed at the refund client's calls (the OA/mini clients are R3's).
6. **CR-10-k** (the remark atom also rewrites the return address) and **CR-14-k** (`/api/v1/staff/refunds*` can only answer 403) — read both; do what they ask within your ownership.

## R3 — WeChat, config, edge, storage

**Branch** `rewrite/ws-r3-wechat-config-edge`. **Owns** `next/packages/core/src/{wechat,wechat-oa,system,storage,user}/**` (for `user`: the visit beacon only), `next/packages/contracts/src/{wechat,wechat-oa,system,storage,user}/**`, their routes and route tests, the admin OA pages under `next/apps/web/src/admin/**` (not `kit/`), `next/apps/web/src/server/` **request-meta / `clientIp()` only** (R4 owns the audit write path in `handle.ts`; keep your hunk separate), `deploy/next/**` (edge config), and `next/guards/src/checks/banned.ts` (only to delete the `FETCH_ALLOW` entry CR-31-k2 names).

1. **CR-7-k2** — OA callback: refuse plaintext in 安全模式, ±300 s timestamp window, spend each `(timestamp, nonce)` once in Redis, refuse when disabled. Flip the pins.
2. **CR-8-k2** and **CR-9-k2** — `token` is a secret field; `configSave` refuses keys without a `ui` entry (explicit `ui.hidden` opt-in otherwise); `apiBaseUrl` stays settable through `ctx.config.set` only. Flip the pins.
3. **CR-31-k2** — `WechatCoreClient.upload(...)`, `uploadMedium` on top of it, delete the `FETCH_ALLOW` entry.
4. **CR-21-k2's neighbouring gap** for the OA and mini-program clients (the refund client is R2's).
5. **CR-33-k2** — option 1 (publish error on the row + refetch on failure).
6. **CR-11-k2** — per-subject ceiling on visits, per-user window on uncached mini codes. Flip the pins.
7. **CR-14-k2** — the trust boundary: edge overwrites `X-Forwarded-For` / sets `X-Real-IP` with `set_real_ip_from` Traefik's network; `clientIp()` reads `X-Real-IP`; a test that a client-supplied XFF is ignored. Also **CR-13-k items 3–4** (uploads served with `nosniff` / the remaining items) in the same edge config.
8. **CR-11-k** (`safeFetch` connects to an IP literal over TLS — pin the resolved address without breaking SNI/cert validation; `https://` imports and F4's base64 must work) and **CR-12-k** (throttle the public scan-upload endpoint; `COMPLETE_LUA` checks the state it claims). Flip K1's pins where they exist.

## R4 — auth, audit, admin shell, and the domain leftovers

**Branch** `rewrite/ws-r4-auth-audit`. **Owns** `next/packages/core/src/{auth,coupon,presale,diy,notification}/**` (not `notification.send.ts`, which is R1's), their contracts and routes, `next/apps/web/src/server/handle.ts` **audit write path** (R3 owns `clientIp()`), the admin notification bell / SSE hook and 操作日志 page under `next/apps/web/src/admin/**`, and — **granted for this stream only** — `next/apps/web/src/admin/kit/**` for CR-16-k and **one additive migration** in `next/packages/db/**` for CR-13-k2 (bump `EXPECTED_MIGRATIONS`; `tests/static/next-migration-guard.cjs` must stay green; additive only).

1. **CR-8-k** — an admin session older than 32 h survives a password change: revoke every session of the admin on password change / revoke-all, however long it was kept alive. Flip `admin-session.revoke.int.test.ts`'s pin.
2. **CR-9-k** — audit redaction recurses into nested objects/arrays. Flip `audit.redact.test.ts`'s pin.
3. **CR-12-k2** — admin login outcomes written to `audit_logs` (`routeId: 'auth.adminLogin'`), never the body; IP from `clientIp()`.
4. **CR-13-k2** — staff-surface audit rows are recorded: `actor_kind` + `user_id` on `audit_logs` (the migration), `handle()` writes them for `surface === 'staff'`, the 操作日志 screen lists both kinds.
5. **CR-15-k2** — the SSE stream re-resolves the session on each keep-alive and closes when it no longer resolves; one shared subscriber per process (or at least a per-admin cap).
6. **CR-32-k2** — the bell listens for the named event, seeds from the inbox routes on mount, and mark-read calls the routes.
7. **CR-16-k** — the admin shell's user-menu 404 and the unused route guard.
8. **CR-10-k2** — `staffGrant` refuses non-`active` templates and self-grants. Record the per-staff daily cap as a product question in the status (not built).
9. **CR-34-k2** — storefront presale detail answers `PRESALE_ACTIVITY_NOT_FOUND` unless `active` or `ended`; `paused` → `canBuy: false` (the page stays readable for linked orders).
10. **CR-42-k2** — cache the cleaned storefront home payload under `DIY_CACHE`, mirror the 个人中心 cache tests.
