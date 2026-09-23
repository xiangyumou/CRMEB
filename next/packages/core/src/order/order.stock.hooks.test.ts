import { describe, expect, it } from 'vitest';
import '../domains.gen';
import { COMMIT_SALE_HOOK } from './order.stock.hooks';
import { onOrderPaid } from './ports';

/**
 * CR-1-k2. The campaign hooks say the SKU-level sale "just" happened, so the
 * commit has to run ahead of them. What is asserted is the production module
 * graph — a fresh import of every domain, the way the web process and the
 * worker load them — not a test's `resetOrderPorts()` re-registration, whose
 * order is whatever the test calls.
 */
describe('CR-1-k2 — the paid hook that commits the sale', () => {
  it('runs first, ahead of the group-buy seat and the presale sale', () => {
    const names = onOrderPaid.names();
    expect(names[0]).toBe(COMMIT_SALE_HOOK);
    expect(names).toContain('groupbuy:take-seat');
    expect(names).toContain('presale:commit-sale');
    expect(names.filter((name) => name === COMMIT_SALE_HOOK)).toHaveLength(1);
  });
});
