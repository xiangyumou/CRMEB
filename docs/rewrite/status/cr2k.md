# CR-2-k — status

**Stream:** K (hardening) **Status:** RESOLVED 2026-09-23
**CR:** `docs/rewrite/cr/CR-2-k.md`

## What this closed

`docs/rewrite/invariants.md` had 28 rows sitting `unmapped` (or `ported` with a
dead test id, or written twice) with no stream left to fix them from inside —
the fix required editing an orchestrator-owned file. CR-2-k's `pending-edits.ts`
allow-list carried the proposed edits since round 1; this pass applied every
edit CR-2-k asked for, deleted the matching entries, and shrank the ledger's
open count from 28 to 13 (the 13 that are still legitimately owed to streams
C, I and K's own next pass — see below).

## Guard counts (`pnpm guards`, `invariants` check)

| | Baseline | Final |
| --- | --- | --- |
| ported | 223 | 229 |
| retired/dropped | 23 | 32 |
| unmapped (pending) | 28 | 13 |
| pending total (all streams) | 94 | 74 |
| `pending(orchestrator)` lines | 20 | 0 |
| failures | 0 | 0 |

Row count: 275 → 274 (one duplicate `SMOKE-001` deleted, §5).

## Per-section outcome

1. **9 rows, wrong state → `dropped`** (HIST-001, MAINT-001, MIG-018…022,
   CORE-001, SQL-001) — each section already said "dropped" in its owner
   line; the rows themselves still read `unmapped`. Written into the
   invariant cell with the CR's exact reasoning; test-id cells emptied where
   the CR called for it.
2. **6 rows, `ported` but pointing at nothing → real test ids** (ORDER-008,
   CORE-002, ROUTE-001, AUTH-001 with an **Adapted** note, AUTH-002,
   AUTH-003) — ids applied exactly as CR-2-k §2 wrote them; all 3 candidate
   ids per row were confirmed to resolve against the real test source before
   the file was touched.
3. **36 rows needing an `**Owner: stream X**` marker** — most were already
   resolved by merges since round 1 (J3 applied CR-2-j2's 18 OPS/REL rows; D2
   and its dependents landed separately). 13 remained relevant to this pass:
   `AUTH-005` (owner C, `cr: CR-3-k`), `SMOKE-002…009,012` (owner I),
   `SEQ-001`/`MUT-001`/`STAB-001` (owner K). Markers written into the ledger;
   rows stay `unmapped` because the work is still owed, so the matching
   `pending-edits.ts` entries stay too — deleting them would either misreport
   an in-flight stream (I, K) or make the guard fail outright (C, already
   merged; only the `cr` field on its `assign` entry keeps that from failing).
4. **4 test-id corrections** — GATEWAY-001 ("refuses a over amount") and both
   ETL-F1-003 ids (now pointing at `packages/etl/src/config.test.ts`) applied
   exactly as written. TLS-001 was **not** applied with the literal wording
   the CR proposed (double-backtick fencing) — that text cannot survive this
   ledger's naive single-backtick parser, since the ids' own embedded
   `` `payment` ``/`` `wechat` `` backticks would still truncate the span.
   Applied instead as a `<group>` hole in the cell text, which the resolver's
   existing hole-matching logic already treats as a wildcard against the real
   `it()` titles — confirmed against the actual parser/resolver code, not
   guessed, before editing the real file. Noted in CR-2-k.md's "Round 2
   resolution" section.
5. **1 duplicate row** — the empty, `unmapped` `SMOKE-001` in the
   storefront-smoke section deleted; the `ported` `SMOKE-001` in the freight
   section (pointed at `FreightPort.quote`) is untouched and is now the only
   `SMOKE-001` row.

## `pending-edits.ts`

`PENDING_EDITS` went from 29 entries to 13 (the §3 stream-owned rows above).
`LEDGER_CORRECTIONS` (4 entries) and `DUPLICATE_ROWS` (1 entry) are both now
empty arrays, kept with an explanatory comment matching
`pending-implementations.ts`'s convention for a placeholder allow-list.

## Also touched

`next/guards/src/lib/matrices.test.ts` — the `'gives every ledger row a known
state'` unit test's hardcoded expected-states array was missing `dropped`; its
own comment already anticipated this being CR-2-k's result. Updated the array
and comment so `test:unit` passes. Not in CR-2-k's owned-files list, but a
direct, self-documented consequence of the CR and required by the Definition
of Done.

## Verification

- `pnpm exec turbo run guards --force` (from `next/`): 10 checks, 0
  failure(s), 74 pending on B3, E4, F4, H3, I, K, 0 `pending(orchestrator)`
  lines. (`--force` needed: `invariants.md` lives outside `next/`, so turbo's
  cache does not see edits to it.)
- `pnpm exec prettier --check .` (from `next/`): clean. (Note: this check does
  not actually cover `docs/rewrite/invariants.md`, which is outside `next/` —
  its table padding was still hand-verified via `git diff` to match the
  file's existing per-table column-width convention, touching only the rows
  the CR names.)
- `pnpm --filter @shop/guards run typecheck`: clean.
- `pnpm --filter @shop/guards run lint`: clean.
- `pnpm --filter @shop/guards run test:unit`: green.
