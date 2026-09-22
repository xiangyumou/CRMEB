/**
 * `tests/regression/risk-matrix.md` -> the rewrite's invariant ledger.
 *
 * The matrix has no ids: it is 78 prose entries, each walked to the state it
 * changes and the evidence that existed in 2026-09. `invariants.md` folds the
 * "new" and "thin" ones into per-stream rows (`RISK-B1-001`, `FULFILL-001`,
 * …), and the "covered" ones are already legacy case ids. This table is the
 * join, and the guard checks it three ways:
 *
 *   1. every entry of the matrix is in this table (a new matrix row fails until
 *      somebody decides where it went);
 *   2. every entry of this table is in the matrix (a renamed row fails rather
 *      than silently resolving to nothing);
 *   3. every id named here exists in `invariants.md` and is `ported` — unless
 *      the entry is parked on a stream still in flight, or retired with a
 *      reason.
 *
 * `section` is the matrix heading verbatim; `entry` is the first cell verbatim.
 */

export type RiskResolution =
  | { kind: 'invariants'; ids: string[] }
  | { kind: 'pending'; stream: string; why: string }
  | { kind: 'retired'; why: string }
  | { kind: 'manual'; why: string };

export interface RiskMapping {
  section: string;
  entry: string;
  resolution: RiskResolution;
}

const invariants = (...ids: string[]): RiskResolution => ({ kind: 'invariants', ids });
const pending = (stream: string, why: string): RiskResolution => ({ kind: 'pending', stream, why });
const retired = (why: string): RiskResolution => ({ kind: 'retired', why });
const manual = (why: string): RiskResolution => ({ kind: 'manual', why });

export const RISK_MAP: readonly RiskMapping[] = [
  // 1 -----------------------------------------------------------------------
  {
    section: '1. Products and cart',
    entry: 'Product on/off shelf (`is_show`)',
    resolution: invariants('CAT-001', 'RISK-B1-001'),
  },
  {
    section: '1. Products and cart',
    entry: 'SKU swap between confirm and create',
    resolution: invariants('RISK-B1-002'),
  },
  {
    section: '1. Products and cart',
    entry: 'Quantity boundaries (decimal, zero)',
    resolution: invariants('STOCK-001', 'CAT-014'),
  },
  {
    section: '1. Products and cart',
    entry: 'Invalid/expired cart rows at create',
    resolution: invariants('RISK-B1-001', 'RISK-B1-003'),
  },
  {
    section: '1. Products and cart',
    entry: 'Stock race on the last unit',
    resolution: invariants('STOCK-003', 'CAT-003'),
  },

  // 2 -----------------------------------------------------------------------
  {
    section: '2. Pricing and order creation',
    entry: 'Server-side recompute over HTTP',
    resolution: invariants('ORDER-001'),
  },
  {
    section: '2. Pricing and order creation',
    entry: 'Coupon threshold boundary',
    resolution: invariants('PRICE-003'),
  },
  {
    section: '2. Pricing and order creation',
    entry: 'Freight threshold',
    resolution: invariants('PRICE-003'),
  },
  {
    section: '2. Pricing and order creation',
    entry: 'Multi-item coupon split',
    resolution: invariants('PRICE-004'),
  },
  {
    section: '2. Pricing and order creation',
    entry: 'Double submit of the same order key',
    resolution: invariants('RISK-B1-004'),
  },
  {
    section: '2. Pricing and order creation',
    entry: 'Create transaction failure mid-way',
    resolution: invariants('RISK-B1-005'),
  },
  {
    section: '2. Pricing and order creation',
    entry: 'Order detail save failure after insert',
    resolution: invariants('RISK-B1-006'),
  },

  // 3 -----------------------------------------------------------------------
  {
    section: '3. Coupons',
    entry: 'Claim limits (per user, total)',
    resolution: invariants('COUPON-007', 'COUPON-008'),
  },
  {
    section: '3. Coupons',
    entry: 'Claim a retired member coupon',
    resolution: invariants('COUPON-001', 'COUPON-002'),
  },
  {
    section: '3. Coupons',
    entry: 'Ownership / cross-user use',
    resolution: invariants('COUPON-005'),
  },
  {
    section: '3. Coupons',
    entry: 'Expiry boundary at redeem',
    resolution: invariants('COUPON-005'),
  },
  {
    section: '3. Coupons',
    entry: 'Concurrent redeem of one coupon',
    resolution: invariants('COUPON-006'),
  },
  {
    section: '3. Coupons',
    entry: 'Failed order returns the coupon',
    resolution: invariants('QUEUE-006', 'QUEUE-007'),
  },
  {
    section: '3. Coupons',
    entry: 'Cancel returns the coupon once',
    resolution: invariants('QUEUE-009'),
  },

  // 4 -----------------------------------------------------------------------
  {
    section: '4. Payment and cancellation',
    entry: 'Payment creation `/api/order/pay`',
    resolution: invariants('PAYC-003', 'CLIENT-001'),
  },
  {
    section: '4. Payment and cancellation',
    entry: 'Payer swap (`type=1`, `pay_uid`)',
    resolution: retired(
      '好友代付 is on the scope guard’s not-ported list; the payer of an attempt is the order’s own buyer and PAYC-004 refuses a replay from a different one',
    ),
  },
  {
    section: '4. Payment and cancellation',
    entry: 'Attempt context immutability + config identity',
    resolution: invariants('PAYC-004', 'PAYC-005'),
  },
  {
    section: '4. Payment and cancellation',
    entry: 'Shared order lock (pay vs cancel)',
    resolution: invariants('PAYC-001', 'QUEUE-003'),
  },
  {
    section: '4. Payment and cancellation',
    entry: 'Paid query result standard',
    resolution: invariants('PAYC-002', 'TLS-006'),
  },
  {
    section: '4. Payment and cancellation',
    entry: 'Paid discovery completes local confirmation',
    resolution: invariants('QUEUE-005'),
  },
  {
    section: '4. Payment and cancellation',
    entry: 'Unknown query result keeps resources',
    resolution: invariants('QUEUE-004'),
  },
  {
    section: '4. Payment and cancellation',
    entry: 'Duplicate / late notification',
    resolution: invariants('PAY-005', 'PAY-007'),
  },
  {
    section: '4. Payment and cancellation',
    entry: 'Notification for a cancelled order',
    resolution: invariants('QUEUE-011'),
  },
  {
    section: '4. Payment and cancellation',
    entry: 'Notification with unknown trade number',
    resolution: invariants('PAY-001'),
  },
  {
    section: '4. Payment and cancellation',
    entry: 'Extra payment while one trade already paid',
    resolution: invariants('PAY-002'),
  },
  {
    section: '4. Payment and cancellation',
    entry: 'Manual + queue + timer cancel together',
    resolution: invariants('QUEUE-009'),
  },
  {
    section: '4. Payment and cancellation',
    entry: 'Cancel when gateway close is unconfirmed',
    resolution: invariants('QUEUE-004'),
  },
  {
    section: '4. Payment and cancellation',
    entry: 'Close of other attempts is gateway-confirmed',
    resolution: invariants('TLS-006'),
  },

  // 5 -----------------------------------------------------------------------
  // D merged with the 拼团 half shipped, so the three group-buy entries are
  // decided against the rows D wrote. "Group create on payment" resolves to
  // RISK-D-001, which *inverts* it — the team is opened when the order is
  // placed, inside the order's own transaction, so there is no paid order
  // without a team — and that is the stronger answer to the risk, not a miss.
  // The two presale entries stay parked, on D2 rather than on D.
  {
    section: '5. Group buys and presale',
    entry: 'Presale activity window',
    resolution: pending('D2', '预售 lifecycle — D shipped 拼团, the presale half is D2’s'),
  },
  {
    section: '5. Group buys and presale',
    entry: 'Group create on payment',
    resolution: invariants('RISK-D-001'),
  },
  {
    section: '5. Group buys and presale',
    entry: 'Group full (last slot) race',
    resolution: invariants('RISK-D-002'),
  },
  {
    section: '5. Group buys and presale',
    entry: 'Group refund demotes leader',
    resolution: invariants('RISK-D-003'),
  },
  {
    section: '5. Group buys and presale',
    entry: 'Presale cancel/restore',
    resolution: pending(
      'D2',
      'QUEUE-008 / REFUND-002 / REFUND-003 are the presale ledgers, which D2 owns',
    ),
  },

  // 6 -----------------------------------------------------------------------
  {
    section: '6. Fulfillment and after-sale',
    entry: 'Delivery + receipt over HTTP',
    resolution: invariants('FULFILL-001', 'ORDER-007'),
  },
  {
    section: '6. Fulfillment and after-sale',
    entry: 'Core fulfillment atomicity',
    resolution: invariants('VIRTUAL-001'),
  },
  {
    section: '6. Fulfillment and after-sale',
    entry: 'Gift coupon issued exactly once',
    resolution: invariants('VIRTUAL-001'),
  },
  {
    section: '6. Fulfillment and after-sale',
    entry: 'Virtual card claim',
    resolution: invariants('CAT-010', 'VIRTUAL-001'),
  },
  {
    section: '6. Fulfillment and after-sale',
    entry: 'Refund freeze',
    resolution: invariants('REFUND-005'),
  },
  {
    section: '6. Fulfillment and after-sale',
    entry: 'Refund amount mismatch on retry',
    resolution: invariants('REFUND-005'),
  },
  {
    section: '6. Fulfillment and after-sale',
    entry: 'Refund cumulative limit',
    resolution: invariants('REFUND-005'),
  },
  {
    section: '6. Fulfillment and after-sale',
    entry: 'Refund unknown result',
    resolution: invariants('REFUND-006'),
  },
  {
    section: '6. Fulfillment and after-sale',
    entry: 'Refund completion computed by the service',
    resolution: invariants('REFUND-004'),
  },
  {
    section: '6. Fulfillment and after-sale',
    entry: 'Split order refund',
    resolution: retired(
      'P0-S dropped order splitting: an order has shipments and `order_items.shipped_quantity`, so there is no child order to re-point a refund at',
    ),
  },
  {
    section: '6. Fulfillment and after-sale',
    entry: 'Retried refund after gateway accept + local failure',
    resolution: invariants('REFUND-004', 'REFUND-006'),
  },

  // 7 -----------------------------------------------------------------------
  {
    section: '7. Authorization',
    entry: 'Cross-user order read/write',
    resolution: invariants('AUTH-003'),
  },
  {
    section: '7. Authorization',
    entry: 'Cross-user refund detail / shipment',
    resolution: invariants('AUTH-005'),
  },
  {
    section: '7. Authorization',
    entry: 'Mobile order-management roster',
    resolution: invariants('AUTH-004'),
  },
  {
    section: '7. Authorization',
    entry: 'Low-privilege admin refund endpoints',
    resolution: invariants('SYS-001', 'SYS-002'),
  },
  { section: '7. Authorization', entry: 'Expired token', resolution: invariants('AUTH-003') },

  // 8 -----------------------------------------------------------------------
  {
    section: '8. Async tasks',
    entry: 'Effect recorded with the payment',
    resolution: invariants('QUEUE-010'),
  },
  {
    section: '8. Async tasks',
    entry: 'Claim / redelivery filters',
    resolution: invariants('QUEUE-011'),
  },
  {
    section: '8. Async tasks',
    entry: 'Failed effect records unknown + attempts',
    resolution: invariants('QUEUE-011'),
  },
  {
    section: '8. Async tasks',
    entry: 'Effects split per event',
    resolution: invariants('QUEUE-011', 'VIRTUAL-001'),
  },
  {
    section: '8. Async tasks',
    entry: 'No-idempotency unknown tasks need a human',
    resolution: invariants('QUEUE-011'),
  },
  {
    section: '8. Async tasks',
    entry: 'Queue delivery failure after commit',
    resolution: invariants('QUEUE-011'),
  },

  // 9 -----------------------------------------------------------------------
  {
    section: '9. Migration and deployment',
    entry: 'Fresh install ships reliability schema',
    resolution: retired(
      'there is one schema and one `0000_init`; "the reliability tables were added later" is a legacy-only distinction',
    ),
  },
  {
    section: '9. Migration and deployment',
    entry: 'Upgrade adds missing objects, rerun no-op',
    resolution: pending('J2', 'drizzle migrations and the ETL runner'),
  },
  {
    section: '9. Migration and deployment',
    entry: 'Column type / required / unique-index verification',
    resolution: retired(
      'MIG-018: verified a MySQL migration tool that has no successor; the constraints themselves are asserted by P0-S’s constraint tests',
    ),
  },
  {
    section: '9. Migration and deployment',
    entry: 'Pre-checks of pending payments/refunds before upgrade',
    resolution: pending('J2', 'the ETL runner’s pre-flight'),
  },
  {
    section: '9. Migration and deployment',
    entry: 'Before/after data snapshots',
    resolution: pending('J2', 'ETL verification counts'),
  },
  {
    section: '9. Migration and deployment',
    entry: 'Exception-payment table ships + migrates',
    resolution: invariants('PAY-001'),
  },
  {
    section: '9. Migration and deployment',
    entry: 'Health check reflects real topology',
    resolution: pending('J2', 'OPS-001/002/004'),
  },
  {
    section: '9. Migration and deployment',
    entry: 'Health check cannot be masked by localhost',
    resolution: pending('J2', 'OPS-001'),
  },
  {
    section: '9. Migration and deployment',
    entry: 'ready.php schema gate',
    resolution: pending('J2', 'OPS-003, now /readyz on the web app'),
  },
  {
    section: '9. Migration and deployment',
    entry: 'Release publish refuses conflicts',
    resolution: pending('J2', 'REL-001..007'),
  },
  {
    section: '9. Migration and deployment',
    entry: 'Manual promotion of a verified digest',
    resolution: pending('J2', 'REL-005'),
  },
  {
    section: '9. Migration and deployment',
    entry: 'Upgrade backup verified before migration',
    resolution: pending('J2', 'OPS-008/009/010'),
  },
  {
    section: '9. Migration and deployment',
    entry: 'Rollback integrity',
    resolution: pending('J2', 'OPS-011'),
  },

  // 10 ----------------------------------------------------------------------
  {
    section: '10. Client surfaces',
    entry: 'Admin/H5/MP builds',
    resolution: pending('J2', 'the release pipeline builds and records digests'),
  },
  {
    section: '10. Client surfaces',
    entry: 'Retired endpoints stay dead',
    resolution: invariants('CORE-002'),
  },
  {
    section: '10. Client surfaces',
    entry: 'Payment failure / pending never rendered as success',
    resolution: invariants('CLIENT-001'),
  },
  {
    section: '10. Client surfaces',
    entry: 'Retired exit entries unreachable',
    resolution: invariants('CORE-001', 'CORE-002'),
  },
  {
    section: '10. Client surfaces',
    entry: 'Real WeChat pay + refund on device',
    resolution: manual(
      'a human with a phone and a merchant account; the fake gateway proves everything up to the wire',
    ),
  },
];
