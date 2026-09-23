import type {
  AdminRefundDetail,
  AdminRefundListItem,
  AdminRefundListQuery,
  RefundApproveBody,
  RefundRejectBody,
} from '@shop/contracts/refund/schemas';
import type { StaffRefundRemarkBody } from '@shop/contracts/order/order.fulfil.schemas';
import type { Ctx } from '../kernel/context';

type PagedAdminRefunds = {
  items: AdminRefundListItem[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * The two seams fulfilment needs from streams that have not landed.
 *
 * Both follow the shape `ports.ts` already established — a slot, a registrar
 * and a `resolve*` that returns `undefined` rather than throwing — because the
 * console has to work without them. The difference from `ports.ts`'s slots is
 * deliberate: a missing `StockPort` is a bug, a missing logistics provider is
 * Tuesday.
 */

// ---------------------------------------------------------------------------
// logistics (stream F2)
// ---------------------------------------------------------------------------

export interface TrackingTrace {
  at: Date;
  context: string;
}

export interface TrackingResult {
  state: 'unknown' | 'in_transit' | 'delivering' | 'delivered' | 'exception';
  traces: TrackingTrace[];
}

/**
 * `shipping`'s courier lookup. Implemented by F2 over 快递鸟/阿里云快递; B2 only
 * ever asks and renders.
 */
export interface LogisticsPort {
  track(
    ctx: Ctx,
    input: { companyCode: string; trackingNo: string; phone?: string },
  ): Promise<TrackingResult>;
}

let logistics: LogisticsPort | undefined;

export function registerLogisticsPort(impl: LogisticsPort): void {
  logistics = impl;
}

/**
 * `undefined` means no provider is configured, and the contract has a field for
 * exactly that (`shipmentTracking.available`). Legacy answered an empty array
 * either way, so an operator could not tell "not configured" from "not scanned
 * yet" and opened a ticket about the courier.
 */
export function resolveLogisticsPort(): LogisticsPort | undefined {
  return logistics;
}

// ---------------------------------------------------------------------------
// after-sales, for the staff console (stream C)
// ---------------------------------------------------------------------------

/**
 * What `/api/v1/staff/refunds*` forwards to.
 *
 * B2 owns the surface, C owns the money: the staff console never touches a
 * gateway, a `refunds` row or `orders.refunded_amount`. The shapes are C's own
 * contract types, passed through untouched, so a field C adds appears on the
 * phone without a second edit here.
 *
 * The implementation must be staff-facing, not the admin services: those
 * demand admin atoms a staff actor never holds (CR-14-k). The refund domain
 * registers its `staff*` entry points, which accept only a `staff` actor.
 */
export interface StaffRefundPort {
  list(ctx: Ctx, query: AdminRefundListQuery): Promise<PagedAdminRefunds>;
  detail(ctx: Ctx, params: { id: string }): Promise<AdminRefundDetail>;
  approve(ctx: Ctx, params: { id: string }, body: RefundApproveBody): Promise<AdminRefundDetail>;
  reject(ctx: Ctx, params: { id: string }, body: RefundRejectBody): Promise<AdminRefundDetail>;
  /**
   * 售后备注 (CR-4-h §2), and deliberately not the console's `adminRemark`.
   *
   * That one overwrites `refunds.admin_remark`; this one appends to the
   * refund's log, because the actor is a `user` with no admin row behind it and
   * the frozen schema has no `refunds.staff_remark` to write instead.
   */
  remark(ctx: Ctx, params: { id: string }, body: StaffRefundRemarkBody): Promise<AdminRefundDetail>;
}

let staffRefunds: StaffRefundPort | undefined;

export function registerStaffRefundPort(impl: StaffRefundPort): void {
  staffRefunds = impl;
}

export function resolveStaffRefundPort(): StaffRefundPort | undefined {
  return staffRefunds;
}

// ---------------------------------------------------------------------------
// notifications (stream E2)
// ---------------------------------------------------------------------------

export interface FulfilmentNotice {
  kind: 'shipment.dispatched' | 'order.received' | 'order.completed' | 'virtual.delivered';
  orderId: number;
  userId: number;
  payload: Record<string, unknown>;
}

/**
 * Where "your parcel is on its way" goes.
 *
 * It is behind the **effects ledger**, not called inline, because it is the one
 * part of shipping that talks to somebody else's server. No notifier registered
 * means the handler logs and returns — which must stay a success, or every
 * shipment parks an effect row for a human who cannot do anything about it.
 */
export interface FulfilmentNotifier {
  notify(ctx: Ctx, notice: FulfilmentNotice): Promise<void>;
}

let notifier: FulfilmentNotifier | undefined;

export function registerFulfilmentNotifier(impl: FulfilmentNotifier): void {
  notifier = impl;
}

export function resolveFulfilmentNotifier(): FulfilmentNotifier | undefined {
  return notifier;
}

/** Test helper. Never call this from app code. */
export function resetFulfilmentPorts(): void {
  logistics = undefined;
  staffRefunds = undefined;
  notifier = undefined;
}
