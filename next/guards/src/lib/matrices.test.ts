import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCases, parseInvariants, parseRiskMatrix, parseTestIds } from './matrices';
import { regressionDir, rewriteDocs } from './paths';

/**
 * The parsers decide what the invariant audit can see. A parser that silently
 * skips a row turns a missing invariant into a green guard, so both halves are
 * tested: the shapes, here, and the counts against the real ledgers below —
 * 131 legacy cases, 220 ledger rows, 78 risk entries as of this pass.
 */

describe('parseCases', () => {
  it('reads the id, the section and the text', () => {
    const cases = parseCases(
      ['## Orders', '- [x] ORDER-001 stock is taken exactly once', '', 'prose'].join('\n'),
    );
    expect(cases).toEqual([
      { id: 'ORDER-001', section: 'Orders', text: 'stock is taken exactly once' },
    ]);
  });
});

describe('parseTestIds', () => {
  it('expands an elided file prefix onto the entry before it', () => {
    const ids = parseTestIds(
      '`packages/core/src/order/order.int.test.ts::checkout > takes stock`, `… > releases it again`',
    );
    expect(ids).toEqual([
      'packages/core/src/order/order.int.test.ts::checkout > takes stock',
      'packages/core/src/order/order.int.test.ts::releases it again',
    ]);
  });

  it('ignores a backticked word that is not a test id', () => {
    expect(parseTestIds('`ported`, `see CONVENTIONS.md`')).toEqual([]);
  });
});

describe('parseInvariants', () => {
  const table = [
    '## Payment',
    '',
    'Owner: **C**',
    '',
    '| Legacy ID | Invariant | New test ID | State |',
    '|---|---|---|---|',
    '| PAY-001 | Money moves once. | `packages/core/src/payment/p.int.test.ts::a > b` | ported |',
    '| PAY-002 | **Owner: stream J** Something else. | | unmapped |',
  ].join('\n');

  it('carries the section owner onto every row', () => {
    const rows = parseInvariants(table);
    expect(rows.map((r) => [r.id, r.section, r.sectionOwner, r.state])).toEqual([
      ['PAY-001', 'Payment', 'C', 'ported'],
      ['PAY-002', 'Payment', 'C', 'unmapped'],
    ]);
  });

  it('lets a row name its own owner', () => {
    expect(parseInvariants(table)[1]?.rowOwner).toBe('J');
  });

  it('skips the header and separator rows', () => {
    expect(parseInvariants(table)).toHaveLength(2);
  });
});

describe('parseRiskMatrix', () => {
  it('reads six-cell rows and keeps the verdict', () => {
    const entries = parseRiskMatrix(
      [
        '## Orders',
        '| Entry | a | b | c | d | Verdict |',
        '|---|---|---|---|---|---|',
        '| Stock oversell | . | . | . | . | covered |',
      ].join('\n'),
    );
    expect(entries).toEqual([{ section: 'Orders', entry: 'Stock oversell', verdict: 'covered' }]);
  });
});

describe('against the real ledgers', () => {
  const read = (file: string): string => fs.readFileSync(file, 'utf8');

  it('reads every legacy case, and every one has a ledger row', () => {
    const cases = parseCases(read(path.join(regressionDir, 'cases.md')));
    const rows = parseInvariants(read(path.join(rewriteDocs, 'invariants.md')));
    const ids = new Set(rows.map((r) => r.id));
    expect(cases.length).toBeGreaterThanOrEqual(131);
    expect(cases.filter((c) => !ids.has(c.id)).map((c) => c.id)).toEqual([]);
  });

  it('gives every ledger row a known state', () => {
    const rows = parseInvariants(read(path.join(rewriteDocs, 'invariants.md')));
    expect(rows.length).toBeGreaterThanOrEqual(220);
    // `dropped` is a state the checker understands but the ledger does not use
    // yet: the sections whose owner already reads "dropped: …" still leave their
    // rows `unmapped`, which is the correction CR-2-k asks for.
    const states = new Set(rows.map((r) => r.state));
    expect([...states].sort()).toEqual(['ported', 'retired', 'unmapped']);
  });

  it('reads every risk-matrix entry', () => {
    const entries = parseRiskMatrix(read(path.join(regressionDir, 'risk-matrix.md')));
    expect(entries.length).toBeGreaterThanOrEqual(78);
    expect(entries.filter((e) => e.verdict === '')).toEqual([]);
  });
});
