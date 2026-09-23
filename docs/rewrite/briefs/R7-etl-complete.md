# Stream R7 — the ETL is complete: wire every written mapper, pass `--require-complete`

**Worktree** `../CRMEB-wt/ws-r7` · **Branch** `rewrite/ws-r7-etl-complete` (cut by the orchestrator from `rewrite/integration`). Read `docs/rewrite/briefs/R-k2-findings.md` § "Common rules" — they apply unchanged (no push, no SSH, no real WeChat / SMS / Aliyun, **no production data of any kind** — the synthetic fixture only, commit per unit with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, no sub-agents, status in `docs/rewrite/status/r7.md`). Then read PLAN §6, `next/packages/etl/src/groups.ts`, `mapper.ts`, `cli.ts`, and the J / J2 / J3 status files for how the runner, `verify` and the drill work.

**Owns:** `next/packages/etl/**` (runner, groups, the mappers under `src/mappers/**` — their domain streams have all merged — tests and fixtures), `deploy/next/rehearsal/etl-drill.sh`, `docs/rewrite/cr/CR-<n>-r7.md`. **Read-only:** everything else. `packages/db` schema is the target as it stands: a mapper that needs a column the schema lacks is a CR, not a migration. R6 is in flight elsewhere (coupon, order read model, groupbuy settle, uni-app, storefront e2e) — no overlap expected.

## What the orchestrator found

`deploy/next/rehearsal/etl-drill.sh --self-test` passes, but reports four groups **pending** — `shipping` (运费模板), `cms` (文章与文章分类), `wechat-oa` (公众号自动回复、二维码、素材), `notification` (通知模板与站内信) — so `etl run --require-complete`, the cutover gate (cutover.md step 11), would refuse. Yet `src/mappers/{shipping,cms,wechat-oa,notification}.ts` exist with tests: the domain streams wrote them and nobody wired them into `GROUPS`. `src/mappers/{groupbuy,presale}.ts` exist too and have **no group at all**.

## 1. Wire the four pending groups

For each: `mapper`, `sources` (the legacy tables the mapper's input reads), `targets` (every table it writes), `softDependencies` (e.g. catalog's `keptShippingTemplateIds` becomes real once `shipping` lands), `extras` where the mapper needs context. Keep the load order a foreign-key order and say why where it moves. Whatever the mapper already decides to drop (for example material the rewrite does not keep) stays counted in its report, never silent.

## 2. Add `groupbuy` and `presale` groups

Read each mapper for what it migrates. **Orders are not migrated (PLAN §6)**: activities and their SKU rows migrate; anything keyed to a legacy order (teams, members, presale orders) is dropped **and counted** — if a mapper does otherwise, make it follow PLAN and say so in the status. Place both after `catalog` (they reference products and SKUs).

## 3. `verify` covers every group

`etl verify` (row counts, money sums where the group has money, `--full-digest` where it applies) must know the new groups. A group without a verify rule is a gap: add one, or write in the status why the group has nothing to verify beyond counts.

## 4. The fixture exercises every group

Extend `packages/etl/test/fixtures/legacy-mini.sql` with a few realistic rows for each newly wired group (shapes taken from the legacy schema in `crmeb/`, never from any real dump), including at least one row each mapper must drop and count. The ETL integration test then runs `run --require-complete` and `verify` over the whole fixture and asserts per-group counts.

## 5. The drill proves completeness

`etl-drill.sh --self-test` runs `etl run --require-complete` (not plain `run`). Remove the "every mapper has landed" line from its closing "still to do" list once that is true; keep the two lines about the real dump and the real uploads. Run `--self-test` to green and paste its closing lines in the status.

## Done

From `next/`: `pnpm turbo run gen typecheck lint test:unit build`, `pnpm turbo run test:int --force --concurrency=4`, `pnpm exec prettier --check .`, `pnpm --filter @shop/contracts check:examples`, `pnpm guards` (0 failures, 0 pending — keep it that way), then `deploy/next/rehearsal/etl-drill.sh --self-test` from the repo root (exit 0, `--require-complete` in the log, no group pending). If `invariants.md` has ETL rows whose evidence should now name the new groups' tests, put the exact row text in the status. Final report: per group what migrates / what is dropped and counted, the verify rules, the drill's closing lines, the final commit hash and merge-time notes.
