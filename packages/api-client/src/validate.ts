/**
 * `@shop/api-client/validate`: response validation against the full contracts.
 *
 * This entry imports every contract and zod, which is the whole reason it is
 * separate: the main entry must never import it, and a production mini-program
 * build must not either (zod is ~60 KB minified and compiles its parsers with
 * `new Function` when the runtime allows it). Use it in tests, in the H5 dev
 * server, and in a development mini-program build switched in by the bundler.
 *
 * ```ts
 * import { createApiClient } from '@shop/api-client';
 * import { contractValidator } from '@shop/api-client/validate';
 * const client = createApiClient({ ..., validateResponse: contractValidator() });
 * ```
 */
import type { AnyRouteDef } from '@shop/contracts/conventions';
import { allRoutes } from '@shop/contracts/routes';
import type { ResponseValidator } from './client';
import { ApiError, CLIENT_ERROR_CODES } from './errors';
import type { RouteId } from './types';

let byId: Map<string, AnyRouteDef> | undefined;

/** The full contract of a storefront route (zod schemas, examples and all). */
export function contractOf(id: RouteId | string): AnyRouteDef {
  byId ??= new Map(allRoutes.map((route) => [route.id, route]));
  const route = byId.get(id);
  if (!route) throw new Error(`未知的接口 ${id}`);
  return route;
}

/**
 * A `ResponseValidator` that parses each 2xx body with the route's `response`
 * schema and fails the call with `RESPONSE_SCHEMA_MISMATCH` (zod issues in
 * `details`) when it does not match. The caller still receives the body as the
 * server sent it, not zod's parsed copy: the types describe the wire.
 */
export function contractValidator(): ResponseValidator {
  return (meta, status, payload) => {
    if (status === 204) return;
    const route = contractOf(meta.id);
    const parsed = route.response.safeParse(payload);
    if (!parsed.success) {
      throw new ApiError({
        status,
        code: CLIENT_ERROR_CODES.schema,
        message: `接口 ${meta.id} 返回的数据与契约不符`,
        details: parsed.error.issues,
        routeId: meta.id,
      });
    }
  };
}
