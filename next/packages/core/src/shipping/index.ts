/**
 * The shipping domain's public surface.
 *
 * CONVENTIONS: "A domain in `core` may import another domain only through that
 * domain's `index.ts`". Everything not re-exported here is private —
 * `shipping.repo.ts` above all, which no other domain may reach.
 *
 * | Export                 | Caller     | When                                    |
 * | ---------------------- | ---------- | --------------------------------------- |
 * | `expressCompanies.*`   | routes, B2 | the 发货 picker and its management screen |
 * | `cityTree`             | routes     | 省市区 picker, storefront and admin      |
 *
 * Registration is a side effect of importing this file, exactly like the order
 * domain's state machine: importing `@shop/core/shipping` installs the
 * `FreightPort` B1 quotes through and the `LogisticsPort` B2 tracks through, so
 * neither stream imports an implementation.
 */

export { shippingPermissions } from './permissions';

export * as expressCompanies from './shipping.express.service';
export { cityTree, resetCityTreeCache } from './shipping.city.service';
