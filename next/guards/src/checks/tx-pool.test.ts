import { describe, expect, it } from 'vitest';
import { txPool } from './tx-pool';

/** CR-53-k2: the tree has no unexplained second pooled connection inside a transaction. */

const findings = (await txPool.run()).findings;

describe('tx-pool over the tree', () => {
  it('finds no pool reach inside a transaction that is neither allowed nor owed', () => {
    const failures = findings.filter((f) => f.level === 'fail');
    expect(failures.map((f) => `${f.where}: ${f.message}`).join('\n')).toBe('');
  });
});
