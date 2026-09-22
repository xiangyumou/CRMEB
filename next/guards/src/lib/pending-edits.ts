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
  | { kind: 'map'; testIds: string[]; why: string }
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
  {
    id: 'ORDER-008',
    resolution: {
      kind: 'map',
      testIds: [
        'packages/core/src/order/order.concurrency.int.test.ts::two checkouts for the last unit > hands back every line it already took when a later line is short',
        'packages/core/src/order/order.int.test.ts::the stock port > takes nothing when one line of several is short, and names that line',
      ],
      why: 'B1 ships the invariant under RISK-B1-005; the legacy id was never pointed at the tests that prove it',
    },
  },
  {
    id: 'AUTH-005',
    resolution: {
      kind: 'assign',
      stream: 'C',
      cr: 'CR-3-k',
      why: 'the refund service already answers REFUND_NOT_FOUND for another user’s row (refund.service.ts), but nothing asserts it — CR-3-k asks C for the cross-user test',
    },
  },

  // --- rows whose section owner names two streams --------------------------
  // E1 has merged, so these three cannot be assigned to it any more. They do
  // not need a stream: E1 shipped the behaviour and only the ledger row was
  // left behind, so each is a `map` at tests that exist today.
  {
    id: 'AUTH-001',
    resolution: {
      kind: 'map',
      testIds: [
        'packages/core/src/auth/auth.test.ts::bearer parsing > reads a well-formed header and nothing else',
        'packages/core/src/auth/auth.test.ts::bearer parsing > requireBearer throws 401 rather than returning null',
      ],
      why: 'the standard header is parsed and nothing else is; the *legacy* half of this row — CRMEB’s `Authori-zation` fallback — has no successor, and `grep -r "Authori-zation"` finds it nowhere in the tree, so the invariant cell should say **Adapted:** one header, not two',
    },
  },
  {
    id: 'AUTH-002',
    resolution: {
      kind: 'map',
      testIds: [
        'apps/web/src/server/handle.test.ts::authentication > user-optional stays anonymous without a token and resolves with one',
      ],
      why: '`user-optional` is the auth mode this row is about, and the test drives it through handle() both ways round — no token and a good one',
    },
  },
  {
    id: 'AUTH-003',
    resolution: {
      kind: 'map',
      testIds: [
        'packages/core/src/auth/auth.int.test.ts::storefront sessions > rejects an expired token',
        'packages/core/src/order/order.ref.int.test.ts::GET /api/v1/orders/:id > gives a stranger the same 404 for a number as for an id',
        'packages/core/src/order/order.int.test.ts::hiding a finished order > answers a second tap, a stranger and an unknown id all with the same 404',
      ],
      why: 'the row asks for two things — token expiry and cross-user order read/write isolation. The first is the storefront session test; the second is covered on both a read (detail, by id *and* by order number) and a write (hide), and in both cases a stranger gets the same 404 as an unknown id, which is the stronger property: the isolation does not leak existence',
    },
  },
  ...['002', '003', '004', '005', '006', '007', '008', '009', '012'].map((n) => ({
    id: `SMOKE-${n}`,
    resolution: {
      kind: 'assign' as const,
      stream: 'I',
      why: 'storefront smoke over the real routes is stream I’s suite; H owns only the API layer',
    },
  })),

  // --- the deployment rows, which J left to J2 ------------------------------
  // J shipped the ETL and the release scripts; the drills that would *prove*
  // these rows are J2's (`deploy/next/**`, the rehearsal suite). J2's own
  // status file already carries CR-2-j2, which asks the orchestrator to map
  // these rows to drill case ids and to retire or adapt six of them with
  // reasons. So this entry does not propose a different answer — it names the
  // CR that owns the answer, and keeps the guard from calling the rows a
  // failure in the meantime.
  ...[
    ...Array.from({ length: 11 }, (_, i) => `OPS-${String(i + 1).padStart(3, '0')}`),
    ...Array.from({ length: 7 }, (_, i) => `REL-${String(i + 1).padStart(3, '0')}`),
  ].map((id) => ({
    id,
    resolution: {
      kind: 'assign' as const,
      stream: 'J2',
      cr: 'CR-2-j2',
      why: 'J shipped the ETL and the release scripts, but the deploy rehearsal that proves these rows is J2’s — CR-2-j2 (status/j2.md) already asks for exactly this mapping',
    },
  })),

  // --- sections whose heading already says "dropped" ------------------------
  // The section owner reads `dropped: …`, but the rows under it were left
  // `unmapped`, so the ledger's own counts call them open work. The state is
  // what CR-2-k asks to correct; the reason below is the section's own.
  {
    id: 'HIST-001',
    resolution: {
      kind: 'retire',
      why: 'Dropped: no orders are migrated. The ETL carries products, users and configuration; order history stays in the legacy database, which keeps serving it. There is no 历史：… pay label to keep stable because there is no historical order in the new schema to label.',
    },
  },
  // MIG-001 … MIG-017 used to sit here. The orchestrator applied that half of
  // CR-2-k and they read `retired` now, so the entries are gone: the list may
  // only shrink.
  {
    id: 'MAINT-001',
    resolution: {
      kind: 'retire',
      why: 'Dropped: the maintenance endpoints (domain replacement, "clear data", the personal-centre menu editor) are not ported — CONVENTIONS.md § Scope guard. Nothing in the rewrite rewrites media columns in place or truncates tables over HTTP.',
    },
  },

  // --- P0-S: a legacy migration tool the rewrite does not have --------------
  ...['018', '019', '020', '021', '022'].map((n) => ({
    id: `MIG-${n}`,
    resolution: {
      kind: 'retire' as const,
      why: 'verified the legacy `order-reliability` MySQL migration, which has no successor: the rewrite ships one `0000_init` and the ETL, so there is no plan/apply to re-verify. The schema itself is asserted by the constraint tests P0-S shipped.',
    },
  })),

  // --- K's own rows --------------------------------------------------------
  {
    id: 'CORE-001',
    resolution: {
      kind: 'retire',
      why: "the retired payment types, gift rewards and 拼团/预售 order parameters have no successor field to refuse: WeChat v3 is the only driver and the retired parameters are not in any contract. What can still rot — a retired feature coming back as an identifier or a URL — is what `pnpm guards`' `retired` check asserts on every commit.",
    },
  },
  {
    id: 'CORE-002',
    resolution: {
      kind: 'map',
      testIds: [
        'guards/src/checks/retired.test.ts::the retired blacklist > finds no retired identifier in next/ or the uni-app API layer',
        'guards/src/checks/contracts.test.ts::contracts and route files > leaves no route file that no contract describes',
      ],
      why: 'a removed route answers 404 because no route file exists for it; the guard proves the stronger property — the set of reachable URLs *is* the set of contracts',
    },
  },
  {
    id: 'SQL-001',
    resolution: {
      kind: 'retire',
      why: 'ONLY_FULL_GROUP_BY was a MySQL mode that could be off. PostgreSQL rejects an ungrouped column at parse time in every configuration, and every query here is a typed Drizzle builder, so there is no setting to assert.',
    },
  },
  {
    id: 'ROUTE-001',
    resolution: {
      kind: 'map',
      testIds: [
        'guards/src/checks/contracts.test.ts::contracts and route files > matches every contract to a route file that exports its method',
        'guards/src/checks/contracts.test.ts::contracts and route files > leaves no route file that no contract describes',
      ],
      why: 'the App Router directory is the route table, so "every registered route resolves to a real handler" is the contracts guard, both ways round',
    },
  },
  {
    id: 'SEQ-001',
    resolution: {
      kind: 'assign',
      stream: 'K',
      why: 'the fixed-seed interleaving sequence runs in the second hardening pass, once D and E1 can take part in it',
    },
  },
  {
    id: 'MUT-001',
    resolution: {
      kind: 'assign',
      stream: 'K',
      why: 'mutation testing of the ten protections runs in the second hardening pass',
    },
  },
  {
    id: 'STAB-001',
    resolution: {
      kind: 'assign',
      stream: 'K',
      why: 'the 50-round concurrency job is designed in CR-4-k and runs in the second pass',
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
  {
    id: 'TLS-001',
    written:
      'packages/core/src/payment/payment.config.test.ts::TLS-001 — no TLS toggle, in any group this stream owns > has no verification switch in',
    corrected:
      'packages/core/src/payment/payment.config.test.ts::TLS-001 — no TLS toggle, in any group this stream owns > has no verification switch in `payment` / `wechat`',
    why: 'the cell writes each id inside single backticks and the ids themselves contain backticks (`` `payment` ``), so markdown closes the code span early: three of the four ids in that cell are unreadable. Fence them with double backticks. The tests exist — payment.config.test.ts:35 (`has no verification switch in \\`${group.group}\\``, run for payment and wechat), payment.config.test.ts:46, refund.config.test.ts:18.',
  },
  {
    id: 'GATEWAY-001',
    written:
      'packages/core/src/payment/payment.int.test.ts::GATEWAY-001 — an amount that disagrees is never booked > refuses an over amount, however well signed it is',
    corrected:
      'packages/core/src/payment/payment.int.test.ts::GATEWAY-001 — an amount that disagrees is never booked > refuses a over amount, however well signed it is',
    why: 'the test is written in a loop over the labels short/over, so vitest reports "refuses a over amount"; the ledger tidied the article and the id stopped resolving',
  },
  {
    id: 'ETL-F1-003',
    written:
      'packages/etl/src/mappers/system.test.ts::config > lists a legacy key no group claims instead of dropping it silently',
    corrected:
      'packages/etl/src/config.test.ts::mapConfig > FAILS on a key nobody claims and nobody dropped',
    why: 'CR-1-j moved config routing out of the system mapper (`mappers/system.test.ts:124` says so in a comment): one legacy key can have more than one claimant, which the old one-to-one map could not express. The invariant is not only kept but strengthened — an unclaimed key no longer gets *listed*, it fails the run.',
  },
  {
    id: 'ETL-F1-003',
    written:
      'packages/etl/src/mappers/system.test.ts::config > converts order_cancel_time from hours to minutes',
    corrected:
      'packages/etl/src/config.test.ts::mapConfig > converts order_cancel_time from hours to minutes (ETL-F1-003)',
    why: 'the same move. The conversion *rule* stayed in the domain (`CONFIG_VALUE_TRANSFORMS`, asserted by `mappers/system.test.ts::config > 把小时换算成分钟的规则留在本域…`); what moved is the mapper that applies it, and the end-to-end assertion went with it — the new test even names the row.',
  },
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
  {
    id: 'SMOKE-001',
    keepState: 'ported',
    why: 'the freight section carries a complete SMOKE-001 — superseded by the `FreightPort` contract and pointed at `shipping.int.test.ts::FreightPort.quote > charges a fixed postage per unit` — while the storefront-smoke section still has the original, empty and `unmapped`. Delete the empty one: it is the same invariant, answered.',
  },
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
