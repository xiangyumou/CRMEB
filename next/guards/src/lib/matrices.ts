/**
 * Readers for the three Markdown ledgers the invariant audit compares:
 *
 *   `tests/regression/cases.md`       the legacy suite, one line per case
 *   `tests/regression/risk-matrix.md` the independent review, one row per entry
 *   `docs/rewrite/invariants.md`      the parity ledger the streams fill in
 *
 * Markdown is not a database, so the parsing is deliberately strict: a row that
 * does not have the expected shape is reported rather than skipped, because a
 * silently skipped row is a missing invariant nobody notices.
 */

export interface LegacyCase {
  id: string;
  section: string;
  text: string;
}

const CASE_LINE = /^- \[([ x])\] ([A-Z]+-\d+)\s+(.*)$/;

export function parseCases(markdown: string): LegacyCase[] {
  const out: LegacyCase[] = [];
  let section = '';
  for (const line of markdown.split('\n')) {
    const heading = /^##\s+(.*)$/.exec(line);
    if (heading) {
      section = (heading[1] ?? '').trim();
      continue;
    }
    const match = CASE_LINE.exec(line.trim());
    if (match) out.push({ id: match[2] ?? '', section, text: match[3] ?? '' });
  }
  return out;
}

export interface InvariantRow {
  id: string;
  section: string;
  /** Owner declared by the section, verbatim (`C`, `B1 / C`, `dropped: …`). */
  sectionOwner: string;
  /** Owner named inside the row itself, which wins when present. */
  rowOwner: string | null;
  invariant: string;
  testIds: string[];
  state: string;
  line: number;
}

const OWNER_LINE = /^Owner:\s*\*\*(.+?)\*\*\s*$/;
const ROW_OWNER = /\*\*Owner:\s*(?:stream\s+)?([A-Za-z0-9-]+)/;

/**
 * Test ids are written in backticks and a repeated prefix is elided with `…`,
 * so `…::` or a leading `… >` inherits the file of the entry before it.
 */
export function parseTestIds(cell: string): string[] {
  const raw = [...cell.matchAll(/`([^`]+)`/g)].map((m) => (m[1] ?? '').trim()).filter(Boolean);
  const out: string[] = [];
  let lastFile = '';
  for (const entry of raw) {
    if (entry.startsWith('…')) {
      if (!lastFile) continue;
      out.push(`${lastFile}::${entry.replace(/^…\s*>?\s*/, '')}`);
      continue;
    }
    const split = entry.indexOf('::');
    if (split < 0) continue;
    lastFile = entry.slice(0, split);
    out.push(entry);
  }
  return out;
}

export function parseInvariants(markdown: string): InvariantRow[] {
  const rows: InvariantRow[] = [];
  const lines = markdown.split('\n');
  let section = '';
  let owner = '';
  for (const [index, line] of lines.entries()) {
    const heading = /^##\s+(.*)$/.exec(line);
    if (heading) {
      section = (heading[1] ?? '').trim();
      owner = '';
      continue;
    }
    const ownerLine = OWNER_LINE.exec(line.trim());
    if (ownerLine) {
      owner = (ownerLine[1] ?? '').trim();
      continue;
    }
    if (!line.startsWith('|')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length !== 4) continue;
    const id = cells[0] ?? '';
    if (!/^[A-Z][A-Z0-9-]*-\d+$/.test(id)) continue; // header and separator rows
    const invariant = cells[1] ?? '';
    rows.push({
      id,
      section,
      sectionOwner: owner,
      rowOwner: ROW_OWNER.exec(invariant)?.[1] ?? null,
      invariant,
      testIds: parseTestIds(cells[2] ?? ''),
      state: (cells[3] ?? '').trim(),
      line: index + 1,
    });
  }
  return rows;
}

export interface RiskEntry {
  section: string;
  entry: string;
  verdict: string;
}

export function parseRiskMatrix(markdown: string): RiskEntry[] {
  const out: RiskEntry[] = [];
  let section = '';
  for (const line of markdown.split('\n')) {
    const heading = /^##\s+(.*)$/.exec(line);
    if (heading) {
      section = (heading[1] ?? '').trim();
      continue;
    }
    if (!line.startsWith('|')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length !== 6) continue;
    const entry = cells[0] ?? '';
    if (entry === 'Entry' || /^-+$/.test(entry)) continue;
    out.push({ section, entry, verdict: cells[5] ?? '' });
  }
  return out;
}
