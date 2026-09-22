# CR-2-k — 51 rows, 4 test ids and one duplicate in `invariants.md`

**Stream:** K (hardening) **Status:** OPEN — partly applied; round 2 below needs the orchestrator (`docs/rewrite/invariants.md` is orchestrator-owned)
**Files:** `docs/rewrite/invariants.md`
**Machine-readable copy:** `next/guards/src/lib/pending-edits.ts` (`PENDING_EDITS`, `LEDGER_CORRECTIONS`, `DUPLICATE_ROWS`)

## What

The invariant audit (`pnpm guards`, check `invariants`) compares three ledgers:
`tests/regression/cases.md` (131 legacy cases), `docs/rewrite/invariants.md`
(273 rows) and `tests/regression/risk-matrix.md` (78 reviewed entries). It is
green, with one class of exception it cannot fix from inside stream K: rows that
are `unmapped` although nobody is going to map them in that state, test ids in
`ported` rows that no longer resolve, and one id the ledger writes twice.

K may not edit `invariants.md`, so the proposed content lives in
`guards/src/lib/pending-edits.ts`, where the guard compares it **exactly**: once
a row here stops being `unmapped`, the guard fails until the entry is deleted.
Applying this CR and deleting the matching entries are one change.

Until then the guard reports each of these as `pending`, naming the stream that
would pick it up.

### Already applied

The orchestrator has written MIG-001 … MIG-017 (`retired`), USER-001, USER-002
(E1) and USER-003 (E2, now `ported`) into the ledger. Those entries are gone
from `pending-edits.ts` — the list can only shrink. What follows is what is
left, plus what the merges since the first round have added.

## 1. Rows whose state is wrong (9)

Sections whose owner already reads `dropped: …` still leave every row
`unmapped`, so the ledger's own counts call them open work.

| Rows              | New state | Reason to write into the invariant cell                                                                                                                                                                                                                                                                                  |
| ----------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| HIST-001          | `dropped` | **Dropped:** no orders are migrated. The ETL carries products, users and configuration; order history stays in the legacy database, which keeps serving it. There is no `历史：…` label to keep stable because there is no historical order in the new schema to label.                                                  |
| MAINT-001         | `dropped` | **Dropped:** the maintenance endpoints (domain replacement, "clear data", the personal-centre menu editor) are not ported — `CONVENTIONS.md` § Scope guard. Nothing in the rewrite rewrites media columns in place or truncates tables over HTTP.                                                                        |
| MIG-018 … MIG-022 | `dropped` | **Dropped:** these verified the legacy `order-reliability` MySQL migration, which has no successor. The schema itself is asserted by the constraint tests P0-S shipped.                                                                                                                                                  |
| CORE-001          | `dropped` | **Dropped:** the retired payment types, gift rewards and 拼团/预售 order parameters have no successor field to refuse — WeChat v3 is the only driver and the retired parameters are in no contract. What can still rot is a retired feature coming _back_, which `pnpm guards`' `retired` check asserts on every commit. |
| SQL-001           | `dropped` | **Dropped:** `ONLY_FULL_GROUP_BY` was a MySQL mode that could be turned off. PostgreSQL rejects an ungrouped column at parse time in every configuration, and every query here is a typed Drizzle builder, so there is no setting to assert.                                                                             |

## 2. Rows that are ported but point at nothing (6)

| Row       | New state             | Test ids                                                                                                                                                                                                                                                                                                                                                                      |
| --------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ORDER-008 | `ported`              | `packages/core/src/order/order.concurrency.int.test.ts::two checkouts for the last unit > hands back every line it already took when a later line is short`, `packages/core/src/order/order.int.test.ts::the stock port > takes nothing when one line of several is short, and names that line`                                                                               |
| CORE-002  | `ported`              | `guards/src/checks/retired.test.ts::the retired blacklist > finds no retired identifier in next/ or the uni-app API layer`, `guards/src/checks/contracts.test.ts::contracts and route files > leaves no route file that no contract describes`                                                                                                                                |
| ROUTE-001 | `ported`              | `guards/src/checks/contracts.test.ts::contracts and route files > matches every contract to a route file that exports its method`, `… > leaves no route file that no contract describes`                                                                                                                                                                                      |
| AUTH-001  | `ported`, **Adapted** | `packages/core/src/auth/auth.test.ts::bearer parsing > reads a well-formed header and nothing else`, `… > requireBearer throws 401 rather than returning null`                                                                                                                                                                                                                |
| AUTH-002  | `ported`              | `apps/web/src/server/handle.test.ts::authentication > user-optional stays anonymous without a token and resolves with one`                                                                                                                                                                                                                                                    |
| AUTH-003  | `ported`              | `packages/core/src/auth/auth.int.test.ts::storefront sessions > rejects an expired token`, `packages/core/src/order/order.ref.int.test.ts::GET /api/v1/orders/:id > gives a stranger the same 404 for a number as for an id`, `packages/core/src/order/order.int.test.ts::hiding a finished order > answers a second tap, a stranger and an unknown id all with the same 404` |

ORDER-008 is already proven — B1 ships it under RISK-B1-005 — and the legacy id
was simply never pointed at the tests. CORE-002 and ROUTE-001 asked for "the
removed routes answer 404" and "every registered route resolves to a real
handler"; the guard proves the stronger property, that the set of reachable
URLs **is** the set of contracts, in both directions, on every commit.

The three AUTH rows were assigned to E1 in round 1 and E1 has since merged, so
they can no longer be assigned to anybody: E1 shipped the behaviour and only the
ledger row was left behind. AUTH-001 needs one word of adaptation —
**Adapted:** the rewrite reads one authorization header, not two. CRMEB's
legacy `Authori-zation` fallback has no successor, and `grep -r "Authori-zation"`
finds it nowhere in the tree. AUTH-003 asks for two things at once; the second,
cross-user order isolation, is covered on a read _and_ a write, and in both
cases a stranger gets the same 404 as an unknown id, which is the stronger
property — the isolation does not leak existence.

## 3. Rows that are unmapped and need an owner written into them (36)

These sit under a section whose owner is `assign per row`, names two streams, or
names a stream that has since split. Written as `**Owner: stream X**` at the
head of the invariant cell, which the guard reads.

| Rows                                         | Owner | Why                                                                                                                          |
| -------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------- |
| SMOKE-002 … SMOKE-009, SMOKE-011, SMOKE-012  | I     | storefront smoke over the real routes is stream I's suite; H owns only the API layer                                         |
| AUTH-005                                     | C     | the refund service already answers `REFUND_NOT_FOUND` for another user's row, but nothing asserts it — **CR-3-k**            |
| STOCK-004, QUEUE-008, REFUND-002, REFUND-003 | D2    | D merged with the 拼团 half of each row shipped and the rows say so themselves; the 预售 half is D2's                        |
| OPS-001 … OPS-011, REL-001 … REL-007         | J2    | J shipped the ETL and the release scripts, but the drills that _prove_ these rows are J2's — see below                       |
| SEQ-001, MUT-001, STAB-001                   | K     | the fixed-seed interleaving sequence, mutation testing and the 50-round concurrency job all run in the second hardening pass |

The eighteen OPS/REL rows do not need a decision from this CR: **CR-2-j2**
(`docs/rewrite/status/j2.md`) already asks the orchestrator to map them to drill
case ids, with OPS-001 retired and OPS-002/003/004/005/007/008 adapted with
reasons. What this CR adds is only that they must not sit as `unmapped` under a
merged stream in the meantime — the guard would otherwise have to call eighteen
rows a failure while the work that answers them is in flight.

## 4. Four test ids that do not resolve

| Row         | Reads                                                                                                                  | Should read                                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| GATEWAY-001 | `… > refuses an over amount, however well signed it is`                                                                | `… > refuses a over amount, however well signed it is`                                                       |
| TLS-001     | four ids in one cell, each inside single backticks                                                                     | the same ids fenced with double backticks                                                                    |
| ETL-F1-003  | `packages/etl/src/mappers/system.test.ts::config > lists a legacy key no group claims instead of dropping it silently` | `packages/etl/src/config.test.ts::mapConfig > FAILS on a key nobody claims and nobody dropped`               |
| ETL-F1-003  | `packages/etl/src/mappers/system.test.ts::config > converts order_cancel_time from hours to minutes`                   | `packages/etl/src/config.test.ts::mapConfig > converts order_cancel_time from hours to minutes (ETL-F1-003)` |

GATEWAY-001's test is written in a loop over the labels `short` and `over`, so
vitest reports `refuses a over amount`. The ledger tidied the article and the id
stopped naming a test.

TLS-001 is a markdown problem, not a test problem. The ids themselves contain
backticks (`` `payment` ``), and they are written inside single-backtick code
spans, so the span closes early: of the four ids in that cell, one is truncated
and three are unreadable. The tests all exist — `payment.config.test.ts:35`
(run for `payment` and `wechat`), `payment.config.test.ts:46`,
`refund.config.test.ts:18`. Fence them with ` ` ``.

ETL-F1-003's two ids moved with the code. **CR-1-j** took config routing out of
the system mapper — one legacy key can have more than one claimant, which a
one-to-one map cannot express — and `packages/etl/src/config.ts` owns it now.
Both halves of the invariant got _stronger_ on the way: an unclaimed key no
longer gets listed, it fails the run, and the hours → minutes conversion keeps
its domain rule in `mappers/system.ts` (`CONFIG_VALUE_TRANSFORMS`, still
asserted there) while the end-to-end assertion sits next to the code that
applies it — the new test even names the row.

## 5. One id written twice

`SMOKE-001` has two rows. The freight section carries a complete one —
superseded by the `FreightPort` contract, `ported`, pointed at
`shipping.int.test.ts::FreightPort.quote > charges a fixed postage per unit` —
while the storefront-smoke section still has the original, empty and `unmapped`.
**Delete the empty one.** It is the same invariant, answered.

Two rows for one id means the ledger's counts are wrong and a reader cannot tell
which is current, so the guard fails on a duplicate by default; this one is
carried in `DUPLICATE_ROWS` with the state of the row that survives, so the id
is judged by the row that is meant to stay rather than by whichever the file
writes first.

## Note on what the guard can and cannot see

The resolver reads three ways of writing a test title — a plain string, a
template literal (a test written in a loop) and `it.each(table)('…')` — and
lets a ledger id elide a repeated part with `<…>`. What it will not do is match
loosely: a renamed test still fails. That is the point.
