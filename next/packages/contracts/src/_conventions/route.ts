import type { z } from 'zod';

/**
 * Who may call a route.
 * - `public`        no credentials looked at
 * - `user`          storefront bearer session required
 * - `user-optional` storefront session attached when present, never required
 * - `staff`         storefront session whose user is an order-handling staff member
 * - `admin`         admin cookie session required; `permission` is mandatory
 * - `webhook`       third-party callback; the handler verifies the provider signature itself
 */
export type AuthMode = 'public' | 'user' | 'user-optional' | 'staff' | 'admin' | 'webhook';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** `/admin-api/...` is the admin surface, `/api/v1/...` the storefront surface. */
export type Surface = 'admin' | 'storefront';

export interface RouteExample {
  name: string;
  params?: Record<string, string>;
  query?: unknown;
  body?: unknown;
  /** Must parse against `response`; the mock server serves the first example. */
  response: unknown;
}

export interface RouteDef<
  TParams extends z.ZodType = z.ZodType,
  TQuery extends z.ZodType = z.ZodType,
  TBody extends z.ZodType = z.ZodType,
  TResponse extends z.ZodType = z.ZodType,
> {
  /** Globally unique, `<domain>.<verbNoun>`, e.g. `coupon.adminList`. Becomes the OpenAPI operationId. */
  id: string;
  method: HttpMethod;
  /** Express-style, e.g. `/admin-api/coupons/:id`. Must start with `/admin-api/` or `/api/v1/`. */
  path: string;
  auth: AuthMode;
  /** Permission atom from `core/<domain>/permissions.ts`. Required iff `auth === 'admin'`. */
  permission?: string;
  summary: string;
  tags: readonly string[];
  params?: TParams;
  query?: TQuery;
  body?: TBody;
  response: TResponse;
  /** Success status. Defaults to 200; use 201 for creation, 204 with `z.void()` for no content. */
  status?: 200 | 201 | 202 | 204;
  /** Error codes this route may return, from the owning domain's `errors.ts`. */
  errors?: readonly string[];
  /**
   * Error statuses that are an ordinary answer for this route and are logged at
   * `info` instead of `warn`/`error`. Declared per route, never inferred: a
   * readiness probe's 503 is "not yet", polled on every deploy (CR-1-j3); the
   * same 503 anywhere else is a dependency failure and stays `error`.
   */
  expectedStatuses?: readonly number[];
  examples: readonly RouteExample[];
}

export type AnyRouteDef = RouteDef<z.ZodType, z.ZodType, z.ZodType, z.ZodType>;

const PATH_PREFIXES = ['/admin-api/', '/api/v1/'] as const;

export function surfaceOf(path: string): Surface {
  return path.startsWith('/admin-api/') ? 'admin' : 'storefront';
}

export function defineRoute<
  TParams extends z.ZodType,
  TQuery extends z.ZodType,
  TBody extends z.ZodType,
  TResponse extends z.ZodType,
>(def: RouteDef<TParams, TQuery, TBody, TResponse>): RouteDef<TParams, TQuery, TBody, TResponse> {
  if (!PATH_PREFIXES.some((p) => def.path.startsWith(p))) {
    throw new Error(`${def.id}: path must start with ${PATH_PREFIXES.join(' or ')}`);
  }
  const surface = surfaceOf(def.path);
  if (surface === 'admin' && def.auth !== 'admin' && def.auth !== 'public') {
    throw new Error(`${def.id}: admin routes use auth 'admin' (or 'public' for login)`);
  }
  if (surface === 'storefront' && def.auth === 'admin') {
    throw new Error(`${def.id}: storefront routes cannot use auth 'admin'`);
  }
  if (def.auth === 'admin' && !def.permission) {
    throw new Error(`${def.id}: admin routes must declare a permission`);
  }
  if (def.auth !== 'admin' && def.permission) {
    throw new Error(`${def.id}: only admin routes declare a permission`);
  }
  if ((def.method === 'GET' || def.method === 'DELETE') && def.body) {
    throw new Error(`${def.id}: ${def.method} routes take no body`);
  }
  if (def.examples.length === 0) {
    throw new Error(`${def.id}: at least one example is required (the mock server serves it)`);
  }
  return def;
}

// `NonNullable` because under `exactOptionalPropertyTypes` an optional property reads as
// `T | undefined`, which never extends `z.ZodType`. A route that omits a part yields `unknown`.
type PartOf<T> = NonNullable<T> extends z.ZodType ? z.output<NonNullable<T>> : undefined;
export type ParamsOf<R extends AnyRouteDef> = PartOf<R['params']>;
export type QueryOf<R extends AnyRouteDef> = PartOf<R['query']>;
export type BodyOf<R extends AnyRouteDef> = PartOf<R['body']>;
export type ResponseOf<R extends AnyRouteDef> = z.input<R['response']>;
