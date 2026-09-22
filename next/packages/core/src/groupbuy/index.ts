/**
 * The group-buy domain's public surface.
 *
 * CONVENTIONS: "A domain in `core` may import another domain only through that
 * domain's `index.ts`." So this file is the boundary, and `groupbuy.repo.ts` in
 * particular is private — nothing outside this folder may read a `groupbuy_*`
 * table.
 *
 * Almost nothing here is called by another domain. Group buy does not *ask* for
 * anything: it attaches to the order aggregate through the frozen seams in
 * `order/ports.ts` and is invoked, never invoking. The exceptions are the two
 * jobs the worker runs and, in the other direction, the one call this domain
 * makes into another — `refund.refundSystemInitiated`, added by **CR-3-d**, for
 * the money a failed team owes back.
 */

export {
  adminActivityCreate,
  adminActivityDelete,
  adminActivityDetail,
  adminActivityList,
  adminActivityOrders,
  adminActivitySetStatus,
  adminActivityUpdate,
  adminGroupComplete,
  adminGroupDetail,
  adminGroupList,
  adminStatistics,
  banners,
  detail,
  groupDetail,
  list,
  myGroups,
  openGroups,
  poster,
  summary,
  withdraw,
} from './groupbuy.service';

export {
  settleExpiredGroups,
  settleGroup,
  type SettleResult,
  type SweepReport,
} from './groupbuy.jobs';

export { groupbuyConfig, type GroupbuyConfig } from './groupbuy.config';
export { groupbuyPermissions } from './permissions';

/**
 * The refund seam. It forwards to `refund.refundSystemInitiated` by default —
 * registering anything else is a test substituting a spy, not a configuration
 * point.
 */
export {
  clearAutoRefundPort,
  registerAutoRefundPort,
  type AutoRefundPort,
} from './groupbuy.effects';

/** Exported for the order-seam tests and for nothing else. */
export { groupbuyKindHandler, groupbuyPricingContributor } from './groupbuy.order';

import { registerGroupbuyEffects } from './groupbuy.effects';
import { registerGroupbuyOrderSeams } from './groupbuy.order';
import './groupbuy.config';

/**
 * Wires the domain into the platform: the order kind handler, the pricing
 * contributor, the three lifecycle hooks and the three effect handlers.
 *
 * Idempotent — every registry replaces by name — so the web bootstrap and a
 * worker job module in the same process may both call it.
 */
export function registerGroupbuyDomain(): void {
  registerGroupbuyOrderSeams();
  registerGroupbuyEffects();
}

// Importing this module registers the domain. Nothing in `core` depends on
// group buy, so without this line a process that only ever reaches the routes
// would have the config group but not the hooks — and an order would be paid
// with nobody to take the seat.
registerGroupbuyDomain();
