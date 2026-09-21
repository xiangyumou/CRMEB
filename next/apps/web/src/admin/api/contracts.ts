/**
 * The single seam between the admin UI and the contract package.
 *
 * Everything the UI needs from contracts is re-exported here so that the
 * orchestrator's merge is a one-line change: replace the `./_p0-stubs/...`
 * import below with `@shop/contracts` and delete `_p0-stubs/`.
 *
 *   export { adminLogin, adminLogout, adminMe, adminIdentity } from '@shop/contracts';
 *   export type { AdminIdentity } from '@shop/contracts';
 */
export {
  adminIdentity,
  adminLogin,
  adminLogout,
  adminMe,
} from './_p0-stubs/auth.contract';
export type { AdminIdentity } from './_p0-stubs/auth.contract';

// Conventions are already frozen and live in the real package.
export {
  asset,
  errorBody,
  id,
  instant,
  money,
  pageQuery,
  paged,
} from '@shop/contracts';
export type {
  AnyRouteDef,
  BodyOf,
  ErrorBody,
  ParamsOf,
  QueryOf,
  ResponseOf,
  RouteDef,
} from '@shop/contracts';
