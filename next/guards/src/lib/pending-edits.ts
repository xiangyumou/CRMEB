/**
 * Rows of `docs/rewrite/invariants.md` that are still `unmapped` although the
 * stream that owns them has merged, together with the resolution K proposes.
 *
 * `docs/rewrite/invariants.md` belongs to the orchestrator (`OWNERSHIP.md`), so
 * stream K may not edit it. The list below is therefore both the guard's
 * allow-list *and* the body of the change request that asks for the edit —
 * `docs/rewrite/cr/CR-2-k.md` carries exactly these lines.
 *
 * It is compared exactly, the way `admin-api-contract.cjs`'s `PRE_EXISTING` was:
 * once a row here stops being `unmapped`, the guard fails until the entry is
 * deleted. A baseline that can only shrink is a baseline; one that can be
 * appended to is a hiding place.
 */

export type Resolution =
  /**
   * `stream`, when set, is the stream whose merge carries the edit — the one
   * that wrote the tests and hands the row text to the orchestrator. Without
   * it the edit is the orchestrator's alone.
   */
  | { kind: 'map'; testIds: string[]; why: string; stream?: string }
  | { kind: 'retire'; why: string }
  /**
   * `cr` names the change request that asks for the work. A merged stream can
   * only be asked through one, so an `assign` to a merged stream without a `cr`
   * is a mistake the check refuses.
   */
  | { kind: 'assign'; stream: string; why: string; cr?: string };

export interface PendingEdit {
  id: string;
  resolution: Resolution;
}

export const PENDING_EDITS: readonly PendingEdit[] = [
  // --- rows whose section owner is "assign per row" -------------------------
  // ORDER-008 used to sit here (`map`, B1's RISK-B1-005 evidence). CR-2-k
  // applied it — the row reads `ported` now — so the entry is gone.

  // --- rows whose section owner names two streams --------------------------
  // E1 has merged, so these three could not be assigned to it any more. They
  // did not need a stream: E1 shipped the behaviour and only the ledger row
  // was left behind, so each was a `map` at tests that exist today. CR-2-k
  // applied all three (AUTH-001 also picked up its **Adapted:** reason) — the
  // rows read `ported` now, so the entries are gone.
  // SMOKE-002…005 were mapped at I's merge to the storefront suite's journeys.
  // The other five (SMOKE-006…009, 012) were answered by H4 and applied at
  // its merge: four ported against core tests, SMOKE-007 retired.

  // OPS-001 … OPS-011 and REL-001 … REL-007 used to sit here, assigned to J2
  // with `CR-2-j2` as the change request that owed them an answer. J3 applied
  // CR-2-j2: every one of those rows now reads `ported` (or `retired`, for
  // OPS-001) and names the drill case or the static guard that proves it, so
  // the entries are gone. The list may only shrink.

  // --- sections whose heading already says "dropped" ------------------------
  // HIST-001 and MAINT-001 used to sit here (`retire`, "Dropped: …" reasons
  // the section owner already gave). CR-2-k applied both — the rows read
  // `dropped` now, so the entries are gone.

  // --- P0-S: a legacy migration tool the rewrite does not have --------------
  // MIG-001 … MIG-022 used to sit here (`retire`, same "no successor to the
  // legacy order-reliability migration" reason for 018…022; 001…017 were
  // applied in an earlier round). CR-2-k applied the rest — every one reads
  // `dropped` now, so the entries are gone.

  // --- K's own rows --------------------------------------------------------
  // CORE-001, CORE-002, SQL-001 and ROUTE-001 used to sit here. CR-2-k
  // applied all four — they read `dropped` (CORE-001, SQL-001) or `ported`
  // (CORE-002, ROUTE-001) now, so the entries are gone.
  {
    // Not settled, and K2 cannot settle it: ten shuffled rounds of the set
    // found a product race (CR-50-k2), a schedule-dependent assertion
    // (CR-51-k2) and a pool deadlock that hangs a round (CR-53-k2), and the
    // CI soak cannot run as written (CR-52-k2). The row stays unmapped until
    // those land; `status/k2.md` carries the text the orchestrator writes.
    // R1 landed CR-50/51/53-k2 (CR-52-k2 was applied to next.yml at K2's
    // merge). Its ten rounds were 8 of 10; both failures are one lock-order
    // deadlock in groupbuy (join vs the leader's refund), CR-2-r1. With the
    // one-line fix applied experimentally the same seeds were 10 of 10.
    // Re-assigned to R5 at R1's merge.
    id: 'STAB-001',
    resolution: {
      kind: 'assign',
      stream: 'R5',
      cr: 'CR-2-r1',
      why: 'ten shuffled rounds are 8/10; both failures are the groupbuy join/refund deadlock',
    },
  },
];

/**
 * Test ids in `invariants.md` that name a test which exists under a slightly
 * different name, or that markdown itself mangles.
 *
 * These rows are `ported` and the test really is there — what is wrong is the
 * id, so they are not `PENDING_EDITS` (which are about a row's *state*). They
 * are the second half of CR-2-k, and they are exactly compared too: once an id
 * resolves, its entry has to go.
 */
export interface LedgerCorrection {
  /** The invariants.md row. */
  id: string;
  /** The id exactly as the ledger writes it (after markdown parsing). */
  written: string;
  /** What it should say. */
  corrected: string;
  why: string;
}

export const LEDGER_CORRECTIONS: readonly LedgerCorrection[] = [
  // Empty since CR-2-k applied its four corrections (2026-09-23): TLS-001's
  // cell now fences its ids so the ids resolve directly (the literal
  // `payment`/`wechat` backticks a markdown fence cannot carry were replaced
  // with a `<group>` hole — see CR-2-k.md's note on the correction),
  // GATEWAY-001 reads "a over amount" and ETL-F1-003 points at
  // `packages/etl/src/config.test.ts`. A row whose id no longer needs this
  // crutch goes here with the id it used to write and what it should say.
];

/**
 * Ids that `invariants.md` writes twice.
 *
 * A duplicate row is a failure by default: two rows for one id means the
 * ledger's counts are wrong and a reader cannot tell which one is current. The
 * entries here are the ones CR-2-k asks the orchestrator to de-duplicate, and
 * they say which of the two survives, so the guard can go on judging the id by
 * the row that is meant to stay rather than by whichever came first in the file.
 *
 * Exactly compared, like everything else here: once an id stops appearing
 * twice, its entry has to go.
 */
export interface DuplicateRow {
  id: string;
  /** The state of the row that stays. The other one is what CR-2-k deletes. */
  keepState: string;
  why: string;
}

export const DUPLICATE_ROWS: readonly DuplicateRow[] = [
  // Empty since CR-2-k deleted the empty, unmapped SMOKE-001 in the
  // storefront-smoke section (2026-09-23); the ported one in the freight
  // section is the only SMOKE-001 left. An id the ledger writes twice again
  // goes here with the state of the row that is meant to survive.
];

export function duplicateRow(id: string): DuplicateRow | undefined {
  return DUPLICATE_ROWS.find((d) => d.id === id);
}

export function ledgerCorrection(id: string, testId: string): LedgerCorrection | undefined {
  return LEDGER_CORRECTIONS.find((c) => c.id === id && c.written === testId);
}

export const PENDING_EDIT_IDS: ReadonlySet<string> = new Set(PENDING_EDITS.map((e) => e.id));

export function pendingEdit(id: string): PendingEdit | undefined {
  return PENDING_EDITS.find((e) => e.id === id);
}
