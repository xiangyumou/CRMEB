// Importing the stand-in adapters installs them as the catalogue/stock
// fallbacks; the day stream A registers the real ports this line goes away.
import './catalog.repo';
import { orderStateMachine } from './order.state-machine';
import { registerOrderStateMachine } from './ports';

/**
 * The order domain's public surface.
 *
 * CONVENTIONS: "A domain in `core` may import another domain only through that
 * domain's `index.ts`". So this file is the contract between the order
 * aggregate and everybody else, and `order.repo.ts` in particular is private.
 *
 * | Export                | Caller | When                                       |
 * | --------------------- | ------ | ------------------------------------------ |
 * | `preview` / `create`  | routes | 确认订单 / 提交订单                         |
 * | `cancel`              | routes | 取消订单                                    |
 * | `cancelOrder`         | C, B2  | payment failed, admin close-out             |
 * | `autoCancel` / `sweepExpiredOrders` | jobs | the payment window closed     |
 * | `list` / `counts` / `detail` | routes | 我的订单                             |
 * | `rebuyLines`          | cart   | 再次购买                                    |
 * | `resolveCatalogPort`  | cart   | live price, stock and status of a variant   |
 *
 * **Direction of dependency.** The cart imports the order domain; the order
 * domain never imports the cart. That is why the catalogue seam
 * (`catalog.port.ts`, B1's stand-in until stream A lands) is re-exported from
 * here, and why the two `cart_items` statements checkout needs live in
 * `order.repo.ts`. Recorded in `docs/rewrite/status/b1.md`.
 */

/**
 * Registering the state machine is a side effect of importing this domain,
 * exactly like a config group or an effect handler: streams C, B2 and D reach
 * it through `getOrderStateMachine()` and never import the implementation.
 */
registerOrderStateMachine(orderStateMachine);

export { create, preview, rebuyLines } from './order.checkout.service';
export { autoCancel, cancel, cancelOrder, sweepExpiredOrders } from './order.cancel.service';
export type { CancelInput, CancelOutcome, CancelReason } from './order.cancel.service';
export { counts, detail, detailOf, list } from './order.query.service';
export { orderStateMachine } from './order.state-machine';
export { orderConfig } from './order.config';

/**
 * The catalogue seam. These three disappear the day stream A registers a real
 * `CatalogPort` and `StockPort`; until then the cart and checkout both read
 * variants through them.
 */
export {
  registerCatalogPort,
  resolveCatalogPort,
  resolveFreightPort,
  resolvePaymentPort,
  resolveStockPort,
  resetCatalogPort,
  peekCatalogPort,
} from './catalog.port';
export type {
  CatalogPort,
  CustomFormField,
  FreightMode,
  ProductKind,
  PurchaseLimitMode,
  SkuForSale,
} from './catalog.port';
