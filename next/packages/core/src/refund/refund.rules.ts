import { Money } from '../kernel/money';

/**
 * What a refund is worth, and what may go into one.
 *
 * Pure functions over plain data, so the interesting arithmetic is unit-tested
 * without a database. The rule they encode, which the legacy controllers did
 * not, is that **the service computes the money and the request never carries
 * it**: `refundApplyBody` has lines and quantities and no amount, so a crafted
 * body cannot ask for more than was paid (risk matrix §6).
 */

export interface RefundableLineInput {
  orderItemId: number;
  quantity: number;
  refundedQuantity: number;
  shippedQuantity: number;
  /** `quantity * unitPrice - discountAmount`, already stored on the line. */
  totalAmount: string;
  refundedAmount: string;
  /** Inside another in-flight request. */
  isOpen: boolean;
}

export interface RefundableLine extends RefundableLineInput {
  refundableQuantity: number;
  refundableAmount: Money;
  blockedReason: string | null;
}

/**
 * How much of a line is still claimable.
 *
 * The share of one unit is the line total divided by its quantity *with the
 * remainder allocated*, never `round(total / quantity)`: three units of 10.00
 * that cost 29.99 must give back 10.00, 10.00 and 9.99, and only an allocation
 * gets the last fen right. Refunding all remaining units therefore always
 * returns exactly what is left, with no drift.
 */
export function refundableLine(line: RefundableLineInput): RefundableLine {
  const remaining = Math.max(0, line.quantity - line.refundedQuantity);
  const total = Money.parse(line.totalAmount);
  const alreadyRefunded = Money.parse(line.refundedAmount);
  const left = total.sub(alreadyRefunded).clampToZero();

  const blockedReason = line.isOpen
    ? 'REFUND_ALREADY_OPEN'
    : remaining === 0
      ? 'REFUND_LINE_INVALID'
      : null;

  return {
    ...line,
    refundableQuantity: blockedReason === null ? remaining : 0,
    refundableAmount: blockedReason === null ? left : Money.ZERO,
    blockedReason,
  };
}

/**
 * The money for `quantity` units of a line.
 *
 * Refunding *all* remaining units gives back everything that is left, so a
 * partial refund followed by the rest can never leave a stray fen behind;
 * fewer units get their allocated share of the line total.
 */
export function lineRefundAmount(line: RefundableLineInput, quantity: number): Money {
  const total = Money.parse(line.totalAmount);
  const alreadyRefunded = Money.parse(line.refundedAmount);
  const remainingUnits = line.quantity - line.refundedQuantity;
  const remainingMoney = total.sub(alreadyRefunded).clampToZero();

  if (quantity >= remainingUnits) return remainingMoney;

  const shares = total.allocate(new Array<number>(line.quantity).fill(1));
  let sum = Money.ZERO;
  for (let i = 0; i < quantity; i += 1) sum = sum.add(shares[i] ?? Money.ZERO);
  // Never promise more than is actually left on the line.
  return sum.lte(remainingMoney) ? sum : remainingMoney;
}

/**
 * Freight comes back only while nothing has shipped.
 *
 * Once a parcel is moving the carrier has been paid, so the shop is out of
 * pocket for it; the legacy code refunded freight on any full refund, which is
 * where "why did we pay the shipping twice" reports came from.
 */
export function freightRefundable(fulfillmentStatus: string): boolean {
  return fulfillmentStatus === 'unfulfilled';
}

export interface CeilingInput {
  paidAmount: string | null;
  refundedAmount: string;
  /** Already committed to other in-flight requests. */
  openAmount: string;
}

/** What a new request may still ask for. Never negative. */
export function remainingCeiling(input: CeilingInput): Money {
  const paid = input.paidAmount === null ? Money.ZERO : Money.parse(input.paidAmount);
  const spoken = Money.parse(input.refundedAmount).add(Money.parse(normalise(input.openAmount)));
  return paid.sub(spoken).clampToZero();
}

/** PostgreSQL prints `sum(numeric)` without trailing zeros; `Money.parse` wants a decimal. */
export function normalise(value: string): string {
  return value.includes('.') ? value : `${value}.00`;
}

/** Which roll-up the order should carry after a refund settles. */
export function orderRefundStatus(
  refundedAmount: Money,
  paidAmount: Money,
  hasOpen: boolean,
): 'none' | 'requested' | 'partially_refunded' | 'refunded' {
  if (refundedAmount.gte(paidAmount) && paidAmount.isPositive()) return 'refunded';
  if (refundedAmount.isPositive()) return 'partially_refunded';
  return hasOpen ? 'requested' : 'none';
}
