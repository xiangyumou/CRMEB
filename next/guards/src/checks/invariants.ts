import fs from 'node:fs';
import path from 'node:path';
import { defineCheck, fail, note, pending, result, type Finding } from '../framework';
import { parseCases, parseInvariants, parseRiskMatrix, type InvariantRow } from '../lib/matrices';
import { nextRoot, regressionDir, repoRoot, rewriteDocs } from '../lib/paths';
import {
  DUPLICATE_ROWS,
  LEDGER_CORRECTIONS,
  PENDING_EDITS,
  duplicateRow,
  ledgerCorrection,
  pendingEdit,
} from '../lib/pending-edits';
import { RISK_MAP } from '../lib/risk-map';
import { isMerged, STREAMS } from '../lib/streams';

/**
 * K-hardening §2, the invariant audit.
 *
 * Three ledgers have to agree:
 *
 *   - `tests/regression/cases.md` — 131 legacy cases. Every one appears in
 *     `invariants.md` exactly once, or the parity ledger has a hole in it.
 *   - `docs/rewrite/invariants.md` — the ledger. A row is `ported` (and then
 *     every test id it names must resolve to a test that exists), `retired` or
 *     `dropped` (and then it must say why), or `unmapped`.
 *   - `tests/regression/risk-matrix.md` — 78 reviewed entries, joined to the
 *     ledger by `lib/risk-map.ts`.
 *
 * An `unmapped` row owned by a stream that has not merged is **pending**, not a
 * failure: E1, D, F2, E2, S and J have not written their tests yet, and failing
 * on that would make this guard unrunnable until the very end, which is the
 * thing the early pass exists to avoid. An `unmapped` row owned by a merged
 * stream *is* a failure, unless `lib/pending-edits.ts` carries the resolution
 * that CR-2-k asks the orchestrator to write into `invariants.md`.
 */

const KNOWN_STATES = new Set(['ported', 'retired', 'dropped', 'unmapped']);

/** Section owners that name no stream because nobody owes a test. */
function droppedSection(owner: string): boolean {
  return /^dropped\b/i.test(owner);
}

/** The stream that owes this row a test, or null when the section says nobody does. */
function ownerOf(row: InvariantRow): string | null {
  if (row.rowOwner) return row.rowOwner;
  const owner = row.sectionOwner.trim();
  if (droppedSection(owner)) return null;
  if (owner === 'Golden slice') return 'golden';
  if (STREAMS.has(owner)) return owner;
  return null; // "assign per row", "B2 / E1", … — resolved by pending-edits.ts
}

/**
 * Every `it(…)` / `test(…)` / `describe(…)` title written in a file.
 *
 * Three forms have to be read: a plain quoted string, a template literal (a
 * test written in a loop), and `it.each(table)('title')`, where the title is in
 * the *second* argument list. Escapes are unescaped, because a title that names
 * a config group writes it as \`${group.group}\` and the backslashes are not
 * part of what vitest reports.
 */
function titlesIn(source: string): string[] {
  const titles: string[] = [];
  for (const match of source.matchAll(
    /\b(?:it|test|describe)(?:\.\w+)*\s*(?:\([^()]*\)\s*)?\(\s*(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|`((?:\\.|[^`\\])*)`)/g,
  )) {
    const raw = match[1] ?? match[2] ?? match[3] ?? '';
    titles.push(raw.replace(/\\(.)/g, '$1'));
  }
  return titles;
}

/**
 * Does a written title name this test?
 *
 * Two kinds of hole have to line up. A test written in a `for` loop has a
 * template title — `` it(`refuses a ${label} amount…`) `` — and the ledger
 * records the name vitest reports for one iteration. A ledger row that covers
 * a whole table writes the hole itself: `refuses <each of five>`. Both sides
 * become `.*` and the comparison is on the literal text around them, so a
 * renamed test still fails while a parameterised one resolves.
 */
function titleMatches(written: string, wanted: string): boolean {
  if (written === wanted) return true;
  if (!/\$\{|</.test(written) && !/</.test(wanted)) return false;
  const holes = /\$\{[^}]*\}|<[^>]*>/g;
  const toPattern = (text: string): string =>
    text
      .split(holes)
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*');
  return (
    new RegExp(`^${toPattern(written)}$`).test(wanted) ||
    new RegExp(`^${toPattern(wanted)}$`).test(written)
  );
}

/**
 * Does this file write `leaf` anywhere, as a line of its own text?
 *
 * Not every proof in the ledger is a vitest test. The deployment rows (OPS-*,
 * REL-*) are proved by the shell drills — `deploy/next/rehearsal/drill.sh`
 * names sixteen stable case ids, `tests/deployment/publish-release.sh` calls
 * `pass '<name>'` against a real registry — and two are proved by a static
 * guard under `tests/static/`, whose "test name" is the message its `assert`
 * carries. None of those are `it(…)`, so `titlesIn` sees nothing in them and a
 * row that cites one would read as "no such test" while the test exists and
 * runs in CI.
 *
 * The match is per line, so a `.*` hole cannot bridge two unrelated statements,
 * and the holes are the same two `titleMatches` knows about plus the shell's
 * bare `$var` — `pass "a first publish creates sha-$sha_a"` is the name the
 * ledger writes as `a first publish creates sha-<sha>`.
 *
 * It is a substring match and deliberately so: renaming a case id still breaks
 * the row, which is the property that matters.
 */
function mentions(source: string, leaf: string): boolean {
  const holes = /\$\{[^}]*\}|\$[A-Za-z_][A-Za-z0-9_]*|<[^>]*>/g;
  const pattern = leaf
    .split(holes)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  const expression = new RegExp(pattern);
  return source.split('\n').some((line) => expression.test(line));
}

/** Vitest reads titles; everything else is read as text. */
function isVitestModule(file: string): boolean {
  return /\.[cm]?tsx?$/.test(file);
}

/**
 * `packages/core/src/x.int.test.ts::describe > it` resolves when the file exists
 * and the leaf name is one of the titles it writes. The leaf is matched rather
 * than the whole chain because vitest composes the reported name from nested
 * `describe`s that live on different lines; the leaf is the one string that is
 * written out.
 *
 * The path is read relative to `next/` first and to the repository root second,
 * because the deployment suites (`deploy/next/rehearsal/`, `tests/deployment/`,
 * `tests/static/`) live outside the workspace and the ledger cites them the way
 * a person would run them, from the root.
 */
function resolveTestId(testId: string): string | null {
  const split = testId.indexOf('::');
  if (split < 0) return `"${testId}" is not <file>::<test name>`;
  const file = testId.slice(0, split);
  const name = testId.slice(split + 2).trim();
  const inWorkspace = path.join(nextRoot, file);
  const absolute = fs.existsSync(inWorkspace) ? inWorkspace : path.join(repoRoot, file);
  if (!fs.existsSync(absolute)) return `no such test file: ${file}`;
  // ` > ` with spaces: `refuses <each of five>` has a `>` of its own.
  const leaf = (name.split(' > ').at(-1) ?? name).trim();
  if (leaf.length === 0) return `"${testId}" names no test`;
  const source = fs.readFileSync(absolute, 'utf8');
  if (!isVitestModule(file)) {
    return mentions(source, leaf) ? null : `${file} writes no case named "${leaf}"`;
  }
  const titles = titlesIn(source);
  if (!titles.some((title) => titleMatches(title, leaf))) {
    return `next/${file} contains no test named "${leaf}"`;
  }
  return null;
}

function hasReason(row: InvariantRow): boolean {
  return /\*\*(Retired|Dropped|Adapted|Inverted|Surface moved|Settled)/i.test(row.invariant);
}

export const invariants = defineCheck(
  'invariants',
  'every regression case maps to a test that exists, or to a reason',
  () => {
    const findings: Finding[] = [];
    const cases = parseCases(fs.readFileSync(path.join(regressionDir, 'cases.md'), 'utf8'));
    const rows = parseInvariants(fs.readFileSync(path.join(rewriteDocs, 'invariants.md'), 'utf8'));
    const risk = parseRiskMatrix(
      fs.readFileSync(path.join(regressionDir, 'risk-matrix.md'), 'utf8'),
    );

    // --- 1. cases.md <-> invariants.md, both ways --------------------------
    const byId = new Map<string, InvariantRow>();
    const duplicatesHit = new Set<string>();
    for (const row of rows) {
      if (byId.has(row.id)) {
        const duplicate = duplicateRow(row.id);
        if (!duplicate) {
          findings.push(fail(`invariants.md:${row.line}`, `${row.id} appears twice`));
          continue;
        }
        duplicatesHit.add(row.id);
        findings.push(
          pending(
            `invariants.md:${row.line}`,
            'orchestrator',
            `${row.id} appears twice; CR-2-k asks for the row that is not "${duplicate.keepState}" to go — ${duplicate.why}`,
          ),
        );
        // Judge the id by the row that is meant to survive, not by whichever
        // the file happens to write first.
        if (row.state === duplicate.keepState) byId.set(row.id, row);
        continue;
      }
      byId.set(row.id, row);
    }
    for (const duplicate of DUPLICATE_ROWS) {
      if (!duplicatesHit.has(duplicate.id)) {
        findings.push(
          fail(
            `pending-edits.ts ${duplicate.id}`,
            'no longer appears twice in invariants.md — delete the entry, CR-2-k has been applied',
          ),
        );
      }
    }
    for (const legacy of cases) {
      if (!byId.has(legacy.id)) {
        findings.push(
          fail(`cases.md ${legacy.id}`, 'has no row in invariants.md — the parity ledger is short'),
        );
      }
    }

    // --- 2. every row is in a state, and the state is honoured -------------
    const correctionsHit = new Set<string>();
    /** An id that does not resolve is a failure unless CR-2-k already corrects it. */
    const checkTestId = (rowId: string, where: string, testId: string): void => {
      const problem = resolveTestId(testId);
      if (!problem) return;
      const correction = ledgerCorrection(rowId, testId);
      if (!correction) {
        findings.push(fail(where, problem));
        return;
      }
      correctionsHit.add(`${rowId} ${testId}`);
      findings.push(
        pending(where, 'orchestrator', `test id corrected in CR-2-k: ${correction.why}`),
      );
    };

    let ported = 0;
    let retired = 0;
    let pendingRows = 0;
    let testIds = 0;

    // `byId`, not `rows`: an id the ledger writes twice has already been
    // reported above, and judging it twice would report the surviving row's
    // state against the discarded row's evidence.
    for (const row of byId.values()) {
      const where = `invariants.md ${row.id}`;
      if (!KNOWN_STATES.has(row.state)) {
        findings.push(fail(where, `unknown state "${row.state}"`));
        continue;
      }

      if (row.state === 'ported') {
        ported += 1;
        if (row.testIds.length === 0) {
          findings.push(fail(where, 'is marked ported but names no test'));
          continue;
        }
        for (const testId of row.testIds) {
          testIds += 1;
          checkTestId(row.id, where, testId);
        }
        continue;
      }

      if (row.state === 'retired' || row.state === 'dropped') {
        retired += 1;
        if (!hasReason(row) && !droppedSection(row.sectionOwner)) {
          findings.push(
            fail(
              where,
              `is ${row.state} but the invariant cell gives no **Retired:**-style reason`,
            ),
          );
        }
        for (const testId of row.testIds) {
          testIds += 1;
          checkTestId(row.id, where, testId);
        }
        continue;
      }

      // --- unmapped --------------------------------------------------------
      const owner = ownerOf(row);
      const edit = pendingEdit(row.id);
      if (owner === null && edit === undefined) {
        findings.push(
          fail(
            where,
            `is unmapped and its section owner ("${row.sectionOwner}") names no single stream — add it to guards/src/lib/pending-edits.ts with a resolution`,
          ),
        );
        continue;
      }
      if (owner !== null && edit === undefined) {
        if (isMerged(owner)) {
          findings.push(
            fail(
              where,
              `is unmapped although stream ${owner} has merged — it owes a test or a reason`,
            ),
          );
        } else {
          pendingRows += 1;
          findings.push(pending(where, owner, 'waits on its stream'));
        }
        continue;
      }
      if (edit) {
        // The proposed resolution has to be real: a `map` must point at tests
        // that exist, an `assign` at a stream that exists.
        if (edit.resolution.kind === 'map') {
          for (const testId of edit.resolution.testIds) {
            testIds += 1;
            const problem = resolveTestId(testId);
            if (problem) findings.push(fail(`${where} (CR-2-k)`, problem));
          }
          const carrier = edit.resolution.stream;
          if (carrier !== undefined && !STREAMS.has(carrier)) {
            findings.push(
              fail(`${where} (CR-2-k)`, `names stream ${carrier}, which does not exist`),
            );
          }
        }
        if (edit.resolution.kind === 'assign') {
          const stream = edit.resolution.stream;
          if (!STREAMS.has(stream)) {
            findings.push(
              fail(`${where} (CR-2-k)`, `proposes stream ${stream}, which does not exist`),
            );
          } else if (isMerged(stream) && stream !== 'K' && !edit.resolution.cr) {
            findings.push(
              fail(
                `${where} (CR-2-k)`,
                `proposes stream ${stream}, which has merged — it cannot pick this up in a later wave`,
              ),
            );
          }
        }
        pendingRows += 1;
        findings.push(
          pending(
            where,
            edit.resolution.kind === 'retire'
              ? 'orchestrator'
              : (edit.resolution.stream ?? 'orchestrator'),
            `resolution proposed in CR-2-k (${edit.resolution.kind})`,
          ),
        );
      }
    }

    // The allow-list may only shrink: a row that has stopped being unmapped
    // must lose its entry, or the list quietly becomes a baseline.
    for (const edit of PENDING_EDITS) {
      const row = byId.get(edit.id);
      if (!row) {
        findings.push(
          fail(`pending-edits.ts ${edit.id}`, 'names a row that is not in invariants.md'),
        );
      } else if (row.state !== 'unmapped') {
        findings.push(
          fail(
            `pending-edits.ts ${edit.id}`,
            `is now "${row.state}" in invariants.md — delete the entry, CR-2-k has been applied`,
          ),
        );
      }
    }

    for (const correction of LEDGER_CORRECTIONS) {
      if (!correctionsHit.has(`${correction.id} ${correction.written}`)) {
        findings.push(
          fail(
            `pending-edits.ts ${correction.id}`,
            'corrects a test id that invariants.md no longer writes that way — delete the entry, CR-2-k has been applied',
          ),
        );
      }
    }

    // --- 3. the risk matrix ------------------------------------------------
    const mapKey = (section: string, entry: string): string => `${section} ${entry}`;
    const mapped = new Map(RISK_MAP.map((m) => [mapKey(m.section, m.entry), m]));
    const seen = new Set<string>();
    for (const entry of risk) {
      const key = mapKey(entry.section, entry.entry);
      seen.add(key);
      const mapping = mapped.get(key);
      if (!mapping) {
        findings.push(
          fail(
            `risk-matrix.md ${entry.section}`,
            `"${entry.entry}" is not in guards/src/lib/risk-map.ts`,
          ),
        );
        continue;
      }
      const resolution = mapping.resolution;
      if (resolution.kind === 'invariants') {
        for (const id of resolution.ids) {
          const row = byId.get(id);
          if (!row) {
            findings.push(
              fail(
                `risk-map.ts ${entry.entry}`,
                `points at ${id}, which invariants.md does not have`,
              ),
            );
          } else if (row.state === 'unmapped' && !pendingEdit(id)) {
            const owner = ownerOf(row);
            if (owner !== null && !isMerged(owner)) {
              pendingRows += 1;
              findings.push(pending(`risk-matrix ${entry.entry}`, owner, `rests on ${id}`));
            } else {
              findings.push(
                fail(`risk-map.ts ${entry.entry}`, `points at ${id}, which is unmapped`),
              );
            }
          }
        }
      } else if (resolution.kind === 'pending') {
        if (isMerged(resolution.stream)) {
          findings.push(
            fail(
              `risk-map.ts ${entry.entry}`,
              `is parked on ${resolution.stream}, which has merged — decide it now`,
            ),
          );
        } else {
          pendingRows += 1;
          findings.push(pending(`risk-matrix ${entry.entry}`, resolution.stream, resolution.why));
        }
      }
    }
    for (const mapping of RISK_MAP) {
      if (!seen.has(mapKey(mapping.section, mapping.entry))) {
        findings.push(
          fail(
            `risk-map.ts ${mapping.entry}`,
            `is no longer a row of risk-matrix.md under "${mapping.section}"`,
          ),
        );
      }
    }

    findings.push(
      note(
        'invariants.md',
        `${ported} ported, ${retired} retired/dropped, ${pendingRows} pending; ${PENDING_EDITS.length} rows await the CR-2-k edit`,
      ),
    );

    return result(
      'invariants',
      'invariant parity',
      `${cases.length} legacy cases and ${risk.length} risk-matrix entries against ${rows.length} ledger rows (${testIds} test ids resolved)`,
      findings,
    );
  },
);
