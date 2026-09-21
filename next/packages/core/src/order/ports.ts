import type { Tx } from '@shop/db';
import type { Ctx } from '../kernel/context';
import type { Money } from '../kernel/money';
import { DomainError } from '../kernel/errors';

/**
 * The cross-domain seams of the order aggregate, frozen for wave 1.
 *
 * Six streams touch an order without owning it: payment and refund (C),
 * fulfilment (B2), group-buy and presale (D), catalog stock (A), freight (F2).
 * If they reached into each other's tables the rewrite would deadlock on
 * merge order, so this file is the *only* thing they share, and it lands
 * before any of them start.
 *
 * Everything here is an interface, a type, or a registry. There is no
 * behaviour: the implementations arrive with their owning stream
 * (`registerStockPort` from A, `registerPaymentPort` from C, …) and the fakes
 * for tests live in `@shop/testing`.
 *
 * Rules that are not negotiable, because they encode defects we are fixing:
 *  - a transition is a **conditional update**, decided on the affected row
 *    count, never a read-then-write (release-readiness: `takeOrder`/`delivery`);
 *  - hooks run **inside** the caller's transaction and may only touch the
 *    database — anything that calls a third party records an effect instead
 *    (CONVENTIONS: "never inside the transaction");
 *  - hooks must be **idempotent**, because the effect ledger retries.
 */

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

/**
 * The order lifecycle. Refund state is *not* here: a refund is its own
 * aggregate owned by stream C, and an order carries a denormalised
 * `refundStatus` alongside this one.
 */
export const ORDER_STATUSES = [
  'pending_payment',
  'paid',
  'shipped',
  'received',
  'completed',
  'cancelled',
  'refunded',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** `from -> allowed to`. A status absent from the table is terminal. */
export type TransitionTable<S extends string> = Readonly<Partial<Record<S, readonly S[]>>>;

/**
 * The canonical table. B1 owns the behaviour, but the shape is fixed here so
 * that D and C can write their guards before B1 lands.
 */
export const ORDER_TRANSITIONS: TransitionTable<OrderStatus> = Object.freeze({
  // Mirrors the `orders_status` enum and its diagram in `db/src/schema/order.ts`.
  // Only an unpaid order is cancelled; a paid one leaves through a full refund (stream C).
  pending_payment: ['paid', 'cancelled'],
  paid: ['shipped', 'refunded'],
  shipped: ['received', 'refunded'],
  received: ['completed', 'refunded'],
  completed: ['refunded'],
  // `cancelled` and `refunded` are terminal.
});

export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  table: TransitionTable<OrderStatus> = ORDER_TRANSITIONS,
): boolean {
  return (table[from] ?? []).includes(to);
}

export interface TransitionResult {
  /** `false` means somebody else moved the order first. Never retry blindly. */
  won: boolean;
  /** Rows the conditional update changed: 0 or 1. */
  affected: number;
  /** The status actually observed when the guard failed, when cheap to read. */
  observed?: OrderStatus;
}

/**
 * Implemented by B1 as exactly one statement:
 *
 *     UPDATE orders SET status = $to, ... WHERE id = $id AND status IN ($from)
 *
 * and the decision is `rowCount > 0`. `from` is a list because several source
 * states may legitimately lead to one target (`paid`/`shipped` -> `cancelled`
 * for an admin close-out).
 */
export interface OrderStateMachine {
  readonly table: TransitionTable<OrderStatus>;
  transition(
    tx: Tx,
    orderId: number,
    from: readonly OrderStatus[],
    to: OrderStatus,
    patch?: Record<string, unknown>,
  ): Promise<TransitionResult>;
}

// ---------------------------------------------------------------------------
// Lifecycle hooks
// ---------------------------------------------------------------------------

export interface OrderEvent {
  orderId: number;
  orderNo: string;
  userId: number;
  /** From `ctx.clock`, so a test can pin it. */
  at: Date;
}

export interface OrderPaidEvent extends OrderEvent {
  paidAmount: Money;
  /** WeChat transaction id, when the payment came from a gateway. */
  transactionId?: string;
}

export interface OrderCancelledEvent extends OrderEvent {
  reason: 'user' | 'timeout' | 'admin' | 'payment-failed';
}

export interface OrderRefundedEvent extends OrderEvent {
  refundId: number;
  refundedAmount: Money;
  /** A partial refund does not end the order's life. */
  partial: boolean;
}

export interface OrderCompletedEvent extends OrderEvent {
  completedBy: 'user' | 'auto' | 'admin';
}

/**
 * Runs inside the caller's transaction. Database work only — no HTTP, no
 * queue side effects other than `recordEffect`, and no throwing for anything
 * that is not a real invariant violation, because a throw rolls the whole
 * state change back.
 */
export type OrderHook<E extends OrderEvent> = (tx: Tx, ctx: Ctx, event: E) => Promise<void>;

interface HookRegistration<E extends OrderEvent> {
  /** `<domain>:<what>`, e.g. `groupbuy:close-team`. Appears in errors and logs. */
  name: string;
  handler: OrderHook<E>;
}

class HookRegistry<E extends OrderEvent> {
  private readonly hooks: HookRegistration<E>[] = [];

  constructor(private readonly label: string) {}

  /** Registering the same name twice replaces it — module reloads in dev are fine. */
  register(name: string, handler: OrderHook<E>): void {
    const at = this.hooks.findIndex((h) => h.name === name);
    if (at >= 0) this.hooks[at] = { name, handler };
    else this.hooks.push({ name, handler });
  }

  names(): string[] {
    return this.hooks.map((h) => h.name);
  }

  clear(): void {
    this.hooks.length = 0;
  }

  /**
   * Runs every hook in registration order, inside `tx`. A hook that throws
   * aborts the transaction — that is intended: if `groupbuy` cannot close the
   * team, the order must not be marked paid either.
   */
  async dispatch(tx: Tx, ctx: Ctx, event: E): Promise<void> {
    for (const hook of this.hooks) {
      try {
        await hook.handler(tx, ctx, event);
      } catch (error) {
        ctx.logger.error(
          { err: error, hook: hook.name, event: this.label, orderId: event.orderId },
          'order hook failed',
        );
        throw error;
      }
    }
  }
}

export const onOrderPaid = new HookRegistry<OrderPaidEvent>('order.paid');
export const onOrderCancelled = new HookRegistry<OrderCancelledEvent>('order.cancelled');
export const onOrderRefunded = new HookRegistry<OrderRefundedEvent>('order.refunded');
export const onOrderCompleted = new HookRegistry<OrderCompletedEvent>('order.completed');

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

export interface StockLine {
  skuId: number;
  quantity: number;
}

/**
 * Stock, owned by stream A.
 *
 * Reserve at order creation, commit on payment, release on cancel/refund.
 * Every method is one atomic statement per line — `incStockDecSales`' read-then
 * -write is the defect being fixed here — and every method is idempotent per
 * `orderId`, because the effect ledger may call `release` twice.
 */
export interface StockPort {
  /** Returns the lines that could NOT be satisfied. Empty array means success. */
  reserve(tx: Tx, orderId: number, lines: readonly StockLine[]): Promise<StockLine[]>;
  release(tx: Tx, orderId: number, lines: readonly StockLine[]): Promise<void>;
  /** Turns a reservation into a sale: stock stays down, `sales` goes up. */
  commit(tx: Tx, orderId: number, lines: readonly StockLine[]): Promise<void>;
}

/**
 * Payment, owned by stream C.
 *
 * `ensureNoOpenAttempts` is the "payment vs cancel" lock (risk matrix §4): the
 * cancel path asks payment whether money may still arrive, and acts on the
 * answer —
 *
 *   `closed`  no attempt can succeed any more; the cancel may proceed;
 *   `paid`    money already arrived; run the paid transition and refuse the cancel;
 *   `unknown` the gateway did not answer in time; refuse the cancel and keep
 *             every reservation, stock and coupon included. Never guess.
 *
 * It is called inside the cancelling transaction with the order row already
 * locked, so it must not perform network I/O that can hang without a timeout.
 */
export type PaymentState = 'closed' | 'paid' | 'unknown';

export interface PaymentPort {
  ensureNoOpenAttempts(tx: Tx, orderId: number): Promise<PaymentState>;
}

/**
 * Freight, owned by stream F2. Called by B1 while pricing a cart.
 *
 * Amounts are integer 分 so the port stays free of the `Money` class at its
 * boundary; `perLine` is aligned with the `lines` argument and must sum to
 * `totalFen`, so B1 can attribute shipping per item for a partial refund.
 */
export interface FreightLine {
  skuId: number;
  quantity: number;
  freightTemplateId: number | null;
  /** Grams. */
  weight: number;
  /** Cubic centimetres. */
  volume: number;
  /** Line subtotal in 分, for "free over N" rules. */
  amountFen: number;
}

export interface FreightQuote {
  totalFen: number;
  /** Same length and order as the requested lines; sums to `totalFen`. */
  perLine: number[];
}

export interface FreightPort {
  quote(
    ctx: Ctx,
    input: { addressCityId: number | null; lines: readonly FreightLine[] },
  ): Promise<FreightQuote>;
}

/**
 * How a marketing stream (coupon, group-buy, presale, …) adjusts a price.
 *
 * Contributors are pure: they look at the draft and return adjustments, they do
 * not write. B1 applies them in `priority` order and splits every adjustment
 * across lines with `Money.allocate`, so the parts always sum back exactly.
 */
export interface PricingLine {
  skuId: number;
  productId: number;
  quantity: number;
  unitPrice: Money;
  /** Line total before any adjustment. */
  subtotal: Money;
}

export interface PricingDraft {
  userId: number;
  lines: readonly PricingLine[];
  /** Sum of the line subtotals. */
  goodsTotal: Money;
  /** Caller-supplied selections, e.g. `{ couponId: '3' }`. */
  selections: Readonly<Record<string, string | undefined>>;
}

export interface PriceAdjustment {
  /** `<domain>:<rule>`, e.g. `coupon:full-reduction`. Shown to the user. */
  source: string;
  label: string;
  /** Negative for a discount. Always applied to the goods total. */
  amount: Money;
  /** Per-line split; when omitted B1 allocates by line subtotal. */
  perLine?: readonly Money[];
  /** Opaque data the contributor needs again at order-creation time. */
  meta?: Record<string, unknown>;
}

export interface PricingContributor {
  name: string;
  /** Lower runs first. Coupons are 100; member-style rules would be lower. */
  priority: number;
  contribute(ctx: Ctx, draft: PricingDraft): Promise<PriceAdjustment[]>;
}

/**
 * Group-buy and presale attach here instead of forking the order service.
 * `kind` is stored on the order and selects the handler again on every later
 * transition.
 */
export interface OrderKindHandler {
  kind: string;
  /** Vetoes or annotates creation; throws a `DomainError` to refuse. */
  beforeCreate(ctx: Ctx, tx: Tx, draft: PricingDraft): Promise<Record<string, unknown>>;
  /** Extra state the kind keeps alongside the order (a team seat, a deposit). */
  afterCreate(ctx: Ctx, tx: Tx, orderId: number, meta: Record<string, unknown>): Promise<void>;
  /** May refuse a transition the base machine would allow. */
  canTransition?(from: OrderStatus, to: OrderStatus): boolean;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

function slot<T>(label: string) {
  let value: T | undefined;
  return {
    set(impl: T): void {
      value = impl;
    },
    get(): T {
      if (value === undefined) {
        throw new DomainError('INTERNAL', {
          message: `${label} 尚未注册（拥有该端口的 stream 未加载）`,
        });
      }
      return value;
    },
    peek(): T | undefined {
      return value;
    },
    clear(): void {
      value = undefined;
    },
  };
}

const stockSlot = slot<StockPort>('StockPort');
const paymentSlot = slot<PaymentPort>('PaymentPort');
const freightSlot = slot<FreightPort>('FreightPort');
const stateMachineSlot = slot<OrderStateMachine>('OrderStateMachine');

export const registerStockPort = stockSlot.set;
export const getStockPort = stockSlot.get;

export const registerPaymentPort = paymentSlot.set;
export const getPaymentPort = paymentSlot.get;

export const registerFreightPort = freightSlot.set;
export const getFreightPort = freightSlot.get;

export const registerOrderStateMachine = stateMachineSlot.set;
export const getOrderStateMachine = stateMachineSlot.get;

const contributors: PricingContributor[] = [];

export function registerPricingContributor(contributor: PricingContributor): void {
  const at = contributors.findIndex((c) => c.name === contributor.name);
  if (at >= 0) contributors[at] = contributor;
  else contributors.push(contributor);
}

/** In `priority` order, then registration order. */
export function getPricingContributors(): readonly PricingContributor[] {
  return [...contributors].sort((a, b) => a.priority - b.priority);
}

const kindHandlers = new Map<string, OrderKindHandler>();

export function registerOrderKindHandler(handler: OrderKindHandler): void {
  kindHandlers.set(handler.kind, handler);
}

export function getOrderKindHandler(kind: string): OrderKindHandler | undefined {
  return kindHandlers.get(kind);
}

export function allOrderKinds(): string[] {
  return [...kindHandlers.keys()].sort();
}

/** Test helper. Never call this from app code. */
export function resetOrderPorts(): void {
  stockSlot.clear();
  paymentSlot.clear();
  freightSlot.clear();
  stateMachineSlot.clear();
  contributors.length = 0;
  kindHandlers.clear();
  onOrderPaid.clear();
  onOrderCancelled.clear();
  onOrderRefunded.clear();
  onOrderCompleted.clear();
}
