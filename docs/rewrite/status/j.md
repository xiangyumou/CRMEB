# J — the ETL runner

Branch `rewrite/ws-j-etl-deploy`, worktree `../CRMEB-wt/ws-j`.

**Scope.** This stream started with three sections; §2 (images, `next/docker`)
and §3 (`deploy/next`: compose, upgrade / rollback / backup, cutover runbook)
were split off into **J2** (`rewrite/ws-j2-deploy`) mid-stream. Nothing had been
started in those paths, so there was nothing to hand over and no commit for J2
to cherry-pick. What is left, and what this file is about, is `§1`: the ETL —
`next/packages/etl/**` except the domain mappers, its tests, and
`scripts/rehearse.sh`.

**State: complete for the domains that have landed.** `plan`, `run`, `verify`
and `assets` work end to end against a synthetic dump, twice over, in Docker.
Seven of eleven groups load; four are waiting for their mappers (`shipping`,
`cms` — F2; `wechat-oa`, `notification` — E2) and say so by name in every
report.

## What it is

Eleven **groups**, each one legacy table set → one PostgreSQL transaction:

```
system  config  storage  user  shipping  catalog  coupon  cms  diy  wechat-oa  notification
```

A group binds a domain **mapper** — the pure `(input) => {rows…, report}`
function the domain streams already write — to its source and target tables.
`defineGroup` type-checks `into:` and `from:` against the mapper's own input and
output types, so a renamed key is a compile error at the definition rather than
an `undefined` halfway through a cutover. **No mapper was changed to fit the
runner**; the contract in `src/mapper.ts` was derived from the five that had
landed when it was written.

Commands (`pnpm --filter @shop/etl etl <cmd>`):

| | |
| --- | --- |
| `plan` | read-only. Counts the source rows per group, lists the target tables, names the groups whose mapper is missing and the source tables a partial dump lacks. Never opens the target database. |
| `run` | the migration. One group, one transaction: empty exactly this group's tables, insert, reset the sequences. `--dry-run`, `--group`, `--require-complete`, `--uploads-root`, `--migrated-at`, `--allow-invalid-config`, `--json`. |
| `verify` | eight families of check across the two databases — row-count expectations with written reasons, money sums, DIY documents compared as parsed JSON (CR-1-g1), attachment files and digests, foreign keys validated and orphan-free, sequences past `max(id)`, and the not-migrated tables empty. |
| `assets` | an rsync plan and a sha256 manifest for the `uploads` tree — only the files the database references. Prints; copies only with `--execute`. |

Connection strings come from `LEGACY_MYSQL_URL` / `DATABASE_URL` **only**, never
from argv, which is visible in `ps` and in shell history. Both handles keep a
redacted label and never the raw string.

## Decisions

1. **Empty-and-reload, not upsert.** Idempotency comes from deleting exactly a
   group's target tables and loading them again from the same snapshot, inside
   one transaction. There is no resume mode: a resumable ETL has partial states,
   and partial states are where the surprises live.
2. **DELETE, not TRUNCATE.** PostgreSQL refuses a plain `TRUNCATE` when any
   table outside the list has a foreign key to one in it, even when both are
   empty, and `CASCADE` is forbidden by the brief. Explicit `setval` follows.
3. **A missing mapper is a named pending group, never a skip.** `plan`, `run`
   and `verify` all print it with the stream that owes it, and
   `--require-complete` — the cutover gate — fails while one exists.
4. **A group that needs another group's ids gets an empty set when that group is
   pending**, so the mapper's own report counts what it dropped, by name. "user
   is pending, so 412 favourites were dropped" is information; a silent skip is
   not.
5. **Unknown mapper field = failure, unless declared.** Before any write, every
   field of every row is checked against the table's real columns. A mismatch
   fails with the mapper, table and field named; a deliberate drop is declared
   in the group with a reason next to it (`dropColumns`, and a CR behind each).
   Dropping unknown keys quietly is exactly how a migration loses a field and
   nobody notices for months.
6. **The config migration is not a mapper.** It is the union of every registered
   group's `legacyKeys`, validated by running each group's zod schema — which a
   pure mapper cannot do. It also fans one legacy key out to **every** claimant,
   which a one-to-one key map cannot express. CR-1-j settled this the whole way:
   `mapSystem` no longer takes a `configKeyMap` at all and no longer emits
   config rows, so there is exactly one place that routes a legacy config key.
7. **A config report prints keys and `<set>` / `<empty>`, never a value.** It is
   the single most likely place for a merchant private key to escape into a
   terminal scrollback, a CI log and a support ticket.
8. **The migration instant is one value per run, and it is printable.** Rows the
   legacy schema has no timestamp for take `migratedAt` rather than `now()`, so
   two runs agree; `--migrated-at` hands the same instant back to a repeat run.
9. **The reference seed is a precondition, not something the ETL fills in.**
   `cities` and `express_companies` are seeded by `packages/db` with the legacy
   ids kept. A group declares what it needs (`requiresReference`) and the runner
   refuses **before the first group** with the command that fixes it. An ETL
   that half-fills a dictionary gives you two sources of truth for the city list.
10. **Fixtures are synthetic, and say so.** `test/fixtures/legacy-mini.sql` uses
    the installer's real DDL with wholly invented rows; its header states that
    every row is made up. No production dump, credential or config value has
    been near this branch.
11. **An alias list is resolved by declaration order, not by dump order.** A
    field like `storage.s3AccessKeyId` lists six vendors' legacy keys and the
    dump has all six, five of them empty. Taking the last row seen meant the
    migrated key depended on how the dump was written — and an empty row could
    blank a real one. The first **non-empty** alias in the order the group
    declares wins, and every loser is reported with the key that beat it.
12. **A foreign key the reference seed cannot satisfy becomes NULL, counted.**
    A group is one transaction: one address pointing at a city the dictionary
    does not have would take every member, address, group and label with it, on
    cutover day. Clearing the link keeps the 省市区 text — which is what a
    customer actually reads — and `addressesCityCleared` says how often it
    happened. Decision 9 still stands: this is for ids the seed legitimately
    never had, not a licence to run without the seed.

## Verification

```
pnpm --filter @shop/etl typecheck lint test:unit test:int   # 292 unit, 9 int, green
shellcheck packages/etl/scripts/rehearse.sh                 # clean
```

The integration test is the load itself: MySQL 8.0 and PostgreSQL 17 in
containers, the synthetic dump imported, the whole migration run, then **run
again and every migrated table dumped row by row and compared**. That comparison
is the point — row counts would miss a reload that changed a value, and the
runner's own report is the thing under test.

### Local rehearsal

`packages/etl/scripts/rehearse.sh <dump.sql>` does the whole thing on throwaway
containers: import → `db:migrate` → `db:seed` → `plan` → `run` → `run` again and
`pg_dump` diff → `verify`. The dump is bind-mounted read-only and never copied
into the repository. Last run, against the synthetic fixture:

```
=== etl run 第二遍 — 证明这件事可以重来 ===
迁移时刻：2026-09-22T08:27:54.000Z（重跑时 --migrated-at 传回它）
两遍迁移的结果完全一致。
=== etl verify — 逐项比对新旧两边 ===
18/18 项通过
还没落地的 group：shipping, cms, wechat-oa, notification（不参与比对）
```

Four defects were found by that script and the integration test rather than by
reading code: a non-idempotent `created_at`, a `jsonb` column encoded as text, a
`pg_get_serial_sequence` call that raises on a composite-key table, and two runs
disagreeing because the migration instant defaulted to `now()` twice.

## Dependencies added

| Package | Version | Where |
| --- | --- | --- |
| `mysql2` | 3.24.4 | `@shop/etl` dependency — the only MySQL client in the repo |
| `@testcontainers/mysql` | 12.1.0 | `@shop/etl` devDependency, integration test |
| `testcontainers` | 12.1.0 | `@shop/etl` devDependency (already used by `@shop/testing`) |

`next/pnpm-lock.yaml` is committed on this branch, by the exception the brief
granted this stream.

## CRs filed — all four decided and closed

The coordinator decided all four on `rewrite/integration` (`b9cf2a52`), and the
fixes landed here after stream J was merged, because E1 and F1 are merged and
nobody else owns those mappers any more. No workaround is left parked.

| | |
| --- | --- |
| **CR-1-j** | `configKeyMap` was one-to-one, but several legacy keys have two claimants (`wechat_appid`, `system_delivery_time`, `store_stock`). **Closed:** the input is gone from `mappers/system.ts` along with the config rows it used to emit; `config.ts` fans out and runs the schemas, and still **fails** on a key no group claims. The remaining duplicates are somebody else's to remove (`wechat`/`wechat-oa` → E3, `trade` → CR-6-f1) and were not touched. |
| **CR-2-j** | `order-fulfil.reviewWindowDays` claimed `order_activity_time` — wrong setting, wrong unit; it would have set a 60-day review window from a 1-hour timer. **Closed:** the claim now points at `system_comment_time`, which is days on both sides and needs no transform; the parked-claim list is empty (the mechanism stays), and `order_activity_time` keeps its drop-list reason. |
| **CR-3-j** | `wechat_identities` rows carried no legacy id, and `city_id` was copied through unchecked — one unknown city would roll back the whole user group. **Closed:** identities carry `eb_wechat_user.id`; the runner passes the seeded city ids to `mapUsers` through `extras` (new `GroupContext.idsOf`), and an id the dictionary lacks becomes NULL and is counted. |
| **CR-4-j** | `mapSystem` emitted `admins.lastLoginIp` (no such column; `users` has one) and `roles.deletedAt` (benign). **Closed:** the mapper stops emitting both and the two `dropColumns` entries are gone — `system` now declares no drops at all. |

CR-5-j is not filed: the finding behind it — `domains.gen.ts` using namespace
imports, which esbuild and tsx elide, so only 6 of 15 config groups registered —
was fixed at the source on `rewrite/integration` in `cdc04601`.

### Nothing is needed from the coordinator

No change to `.github/workflows/next.yml`: `@shop/etl` is a workspace package,
so `pnpm gen typecheck lint test:unit test:int build` already covers it, and the
integration test uses the same testcontainers path as every other `*.int.test.ts`
(it pulls `mysql:8.0` in addition to postgres/redis). `rehearse.sh` is a local
tool and is deliberately not wired into CI: it wants a real dump, and a real dump
must never reach CI.

## Invariants

`docs/rewrite/invariants.md` → **Migration**: MIG-001…017 are retired, each with
its reason in its own cell — they describe the legacy in-place PHP migration
tool (rename tables in the running database, delete seeds, roll back), and this
rewrite loads a separate new database and never writes the old one. Their
substance is replaced by **ETL-J-001…014**, every one mapped to a test that
runs: repeatability, dry-run inertia, id and sequence carry-over, the
`--require-complete` gate, the seed precondition, the eight `verify` families,
the not-migrated tables, config-key accounting, "no value is ever printed",
JSON-encoded config values, and legacy sentinels becoming NULL.

The CR fixes changed two rows and added two. ETL-J-002 is now about ids that
another system may quote surviving a reload — a WeChat identity keeps its legacy
id, and the sequence restart stays as the general rule for tables that really do
carry none. **ETL-J-013** is CR-3-j's other half (an unsatisfiable reference key
becomes NULL and is counted, rather than rolling back the group), and
**ETL-J-014** is alias precedence (decision 11).

(MIG-018…022 sit in P0-S's section and are not this stream's to fill.)

## Not done here

- The four pending groups' mappers (F2, E2). The wiring is written and waiting:
  each group already declares its sources, targets and soft dependencies.
- `etl assets --execute` has never been run against a real `uploads` tree —
  by design, this stream touches no production host.
- Images, compose, upgrade / rollback / backup scripts and the cutover runbook:
  **J2**.
