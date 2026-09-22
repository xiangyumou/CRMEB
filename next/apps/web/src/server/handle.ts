import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { AnyRouteDef, ClientPlatform, RouteDef } from '@shop/contracts/conventions';
import { clientPlatform, surfaceOf } from '@shop/contracts/conventions';
// Side-effect import: makes every zod field message Simplified Chinese, which
// is what CONVENTIONS requires of anything a shopper can see.
import '@shop/contracts/locale';
// Side-effect import: installs every domain — its ports, its order-state
// machine and its effect handlers (CR-8-c). A route module only imports the
// domain it serves, so without this a checkout would run on the fallback
// catalogue adapter and `refund.execute` would be parked as `unknown` by the
// first dispatcher pass after boot. `handle()` is on the path of every request,
// which is why it is here and not in the container.
import '@shop/core/domains';
import { anonymousActor, createCtx, DomainError, type Actor, type Ctx } from '@shop/core/kernel';
import { getStaffCheck, hasPermission, insertAudit, readBearer } from '@shop/core/auth';
import { getContainer, type Container } from './container';
import { isProduction } from './env';

/**
 * `handle(route, fn)` — the only way an HTTP request reaches a service.
 *
 * CONVENTIONS: "`route.ts` files contain no business logic:
 * `export const GET = handle(route, (ctx) => service.fn(ctx, ctx.input))`."
 * Everything that is the same for all ~500 endpoints happens exactly once,
 * here:
 *
 *   parse -> authenticate -> CSRF -> authorise -> build Ctx -> call ->
 *   validate response -> serialise -> log -> audit
 *
 * Errors: a `DomainError` becomes its registered status and Chinese message;
 * anything else becomes a 500 `INTERNAL` with the details logged and *nothing*
 * leaked to the client.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const ADMIN_COOKIE = 'admin_session';

export interface CookieOptions {
  maxAge?: number;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Lax' | 'Strict' | 'None';
}

/** What a handler receives: the request `Ctx` plus the per-request escape hatches. */
export interface RequestCtx extends Ctx {
  readonly request: Request;
  setCookie(name: string, value: string, options?: CookieOptions): void;
  clearCookie(name: string): void;
  setHeader(name: string, value: string): void;
  /** Names the thing this admin operation acted on, for the audit log. */
  audit(target: string): void;
}

/**
 * What the handler's second argument looks like. The types come from the
 * route's own zod schemas, so a typo in `body.acount` is a compile error.
 * A route that declares no schema for a slot gets `unknown` there.
 */
export interface RouteInput<
  TParams extends z.ZodType,
  TQuery extends z.ZodType,
  TBody extends z.ZodType,
> {
  params: z.output<TParams>;
  query: z.output<TQuery>;
  body: z.output<TBody>;
}

export type RouteHandler<
  TParams extends z.ZodType,
  TQuery extends z.ZodType,
  TBody extends z.ZodType,
  TResponse extends z.ZodType,
> = (
  ctx: RequestCtx,
  input: RouteInput<TParams, TQuery, TBody>,
) => Promise<z.input<TResponse>> | z.input<TResponse>;

/** What Next.js passes as the second argument of a route handler. */
export interface NextRouteContext {
  params?: Promise<Record<string, string | string[]>> | Record<string, string | string[]>;
}

export interface HandleOptions {
  /** Injected by tests; production uses the memoised singleton container. */
  container?: Container;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FieldProblem {
  field: string;
  message: string;
}

function issuesOf(error: z.ZodError, prefix: string): FieldProblem[] {
  return error.issues.map((issue) => ({
    field: [prefix, ...issue.path.map(String)].filter(Boolean).join('.'),
    message: issue.message,
  }));
}

function json(status: number, body: unknown, headers: Headers): Response {
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status, headers });
}

function serialiseCookie(name: string, value: string, options: CookieOptions): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path ?? '/'}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  parts.push(`SameSite=${options.sameSite ?? 'Lax'}`);
  return parts.join('; ');
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const at = part.indexOf('=');
    if (at === -1) continue;
    if (part.slice(0, at).trim() === name) {
      return decodeURIComponent(part.slice(at + 1).trim());
    }
  }
  return null;
}

/** Repeated keys become arrays, so `?tag=a&tag=b` reaches a `z.array` schema. */
export function searchParamsToObject(params: URLSearchParams): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    out[key] = values.length > 1 ? values : values[0];
  }
  return out;
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF defence for cookie-authenticated mutations.
 *
 * The admin session is a cookie, so a cross-site form post would otherwise
 * carry it. `SameSite=Lax` already blocks the cross-site POST in every current
 * browser; this is the second lock, and it is the one that does not depend on
 * the browser getting `SameSite` right.
 *
 * A request passes when `Sec-Fetch-Site` says same-origin/same-site, or when
 * `Origin` matches an allowed origin. A request with neither header is
 * refused: every browser that can run the admin SPA sends at least one.
 */
export function checkCsrf(
  request: Request,
  allowedOrigins: readonly string[],
): { ok: true } | { ok: false; reason: string } {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite === 'same-origin' || fetchSite === 'same-site') return { ok: true };
  if (fetchSite === 'cross-site') return { ok: false, reason: 'sec-fetch-site: cross-site' };

  const origin = request.headers.get('origin');
  if (origin && allowedOrigins.includes(origin)) return { ok: true };
  if (origin) return { ok: false, reason: `origin ${origin} not allowed` };

  // `Sec-Fetch-Site: none` is a top-level navigation, which cannot be a
  // programmatic cross-site POST carrying our cookie.
  if (fetchSite === 'none') return { ok: true };
  return { ok: false, reason: 'neither Origin nor Sec-Fetch-Site present' };
}

function platformOf(request: Request): ClientPlatform | null {
  const raw = request.headers.get('x-client-platform');
  if (!raw) return null;
  const parsed = clientPlatform.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// handle()
// ---------------------------------------------------------------------------

export function handle<
  TParams extends z.ZodType,
  TQuery extends z.ZodType,
  TBody extends z.ZodType,
  TResponse extends z.ZodType,
>(
  route: RouteDef<TParams, TQuery, TBody, TResponse>,
  fn: RouteHandler<TParams, TQuery, TBody, TResponse>,
  options: HandleOptions = {},
): (request: Request, context?: NextRouteContext) => Promise<Response> {
  const anyRoute = route as unknown as AnyRouteDef;
  const expectedStatuses = new Set(anyRoute.expectedStatuses ?? []);

  return async function routeHandler(request, context) {
    const container = options.container ?? getContainer();
    const startedAt = Date.now();
    const requestId = request.headers.get('x-request-id') ?? randomUUID();
    const headers = new Headers({ 'x-request-id': requestId });
    const cookies: string[] = [];
    const url = new URL(request.url);
    const logger = container.logger.child({ requestId, routeId: anyRoute.id });

    let actor: Actor = anonymousActor;
    let auditTarget: string | null = null;
    let parsedBody: unknown;

    const finish = (status: number, body: unknown): Response => {
      for (const cookie of cookies) headers.append('set-cookie', cookie);
      // A status the route declares as an ordinary answer is logged as one
      // (CR-1-j3: `/readyz`'s 503 during a rolling start is "not yet", not a
      // fault, and at `error` it buried the one line that was).
      const level = expectedStatuses.has(status)
        ? 'info'
        : status >= 500
          ? 'error'
          : status >= 400
            ? 'warn'
            : 'info';
      logger[level](
        {
          method: request.method,
          path: url.pathname,
          status,
          durationMs: Date.now() - startedAt,
          actor: { kind: actor.kind, id: actor.id },
          platform: platformOf(request),
        },
        'request',
      );
      return status === 204 ? new Response(null, { status, headers }) : json(status, body, headers);
    };

    const fail = (error: DomainError): Response => finish(error.status, error.toBody());

    try {
      // -- 1. input -------------------------------------------------------
      const problems: FieldProblem[] = [];

      const rawParams = (await context?.params) ?? {};
      let params: unknown;
      if (anyRoute.params) {
        const parsed = anyRoute.params.safeParse(rawParams);
        if (parsed.success) params = parsed.data;
        else problems.push(...issuesOf(parsed.error, 'params'));
      }

      let query: unknown;
      if (anyRoute.query) {
        const parsed = anyRoute.query.safeParse(searchParamsToObject(url.searchParams));
        if (parsed.success) query = parsed.data;
        else problems.push(...issuesOf(parsed.error, 'query'));
      }

      let body: unknown;
      if (anyRoute.body) {
        const text = await request.text();
        if (text.length === 0) {
          parsedBody = undefined;
        } else {
          try {
            parsedBody = JSON.parse(text);
          } catch {
            problems.push({ field: '<body>', message: '请求体不是合法的 JSON' });
          }
        }
        if (problems.length === 0) {
          const parsed = anyRoute.body.safeParse(parsedBody);
          if (parsed.success) body = parsed.data;
          else problems.push(...issuesOf(parsed.error, ''));
        }
      }

      if (problems.length > 0) {
        return fail(new DomainError('VALIDATION_FAILED', { details: problems }));
      }

      // -- 2. who is calling ----------------------------------------------
      const surface = surfaceOf(anyRoute.path);
      const platform = platformOf(request);

      if (anyRoute.auth === 'admin') {
        const token = readCookie(request, ADMIN_COOKIE);
        if (!token) return fail(new DomainError('UNAUTHENTICATED'));
        const session = await container.adminAuth.resolve(token);
        if (!session) return fail(new DomainError('AUTH_SESSION_EXPIRED'));
        actor = {
          kind: 'admin',
          id: session.adminId,
          permissions: session.permissions,
          isSuper: session.isSuper,
          sessionId: session.sessionId,
          display: session.account,
        };
      } else if (anyRoute.auth === 'user' || anyRoute.auth === 'staff') {
        const token = readBearer(request.headers.get('authorization'));
        if (!token) return fail(new DomainError('UNAUTHENTICATED'));
        const session = await container.userSessions.resolve(
          baseCtx(container, anonymousActor, platform, requestId, anyRoute.id),
          token,
        );
        if (!session) return fail(new DomainError('UNAUTHENTICATED'));
        if (anyRoute.auth === 'staff') {
          const check = getStaffCheck();
          if (!check) {
            container.logger.error('StaffCheck 未注册（stream B2 未加载）');
            return fail(new DomainError('FORBIDDEN'));
          }
          if (!(await check.isStaff(container.db, session.userId))) {
            return fail(new DomainError('FORBIDDEN', { details: { reason: 'not staff' } }));
          }
        }
        actor = {
          kind: anyRoute.auth === 'staff' ? 'staff' : 'user',
          id: session.userId,
          permissions: [],
          isSuper: false,
          sessionId: String(session.sessionId),
        };
      } else if (anyRoute.auth === 'user-optional') {
        const token = readBearer(request.headers.get('authorization'));
        if (token) {
          const session = await container.userSessions.resolve(
            baseCtx(container, anonymousActor, platform, requestId, anyRoute.id),
            token,
          );
          if (session) {
            actor = {
              kind: 'user',
              id: session.userId,
              permissions: [],
              isSuper: false,
              sessionId: String(session.sessionId),
            };
          }
        }
      }

      // -- 3. CSRF, for cookie auth only ----------------------------------
      if (surface === 'admin' && actor.kind === 'admin' && MUTATING.has(request.method)) {
        const allowed = [container.env.APP_ORIGIN, ...container.env.EXTRA_ALLOWED_ORIGINS];
        const csrf = checkCsrf(request, allowed);
        if (!csrf.ok) {
          logger.warn({ reason: csrf.reason }, 'csrf check failed');
          return fail(
            new DomainError('AUTH_CROSS_SITE_BLOCKED', { details: { reason: csrf.reason } }),
          );
        }
      }

      // -- 4. permission ---------------------------------------------------
      if (anyRoute.permission && !hasPermission(actor, anyRoute.permission)) {
        return fail(new DomainError('FORBIDDEN', { details: { permission: anyRoute.permission } }));
      }

      // -- 5. call ----------------------------------------------------------
      const ctx: RequestCtx = {
        ...baseCtx(container, actor, platform, requestId, anyRoute.id),
        request,
        setCookie: (name, value, cookieOptions = {}) => {
          cookies.push(
            serialiseCookie(name, value, {
              httpOnly: true,
              sameSite: 'Lax',
              secure: isProduction(container.env),
              ...cookieOptions,
            }),
          );
        },
        clearCookie: (name) => {
          cookies.push(
            serialiseCookie(name, '', {
              maxAge: 0,
              httpOnly: true,
              sameSite: 'Lax',
              secure: isProduction(container.env),
            }),
          );
        },
        setHeader: (name, value) => headers.set(name, value),
        audit: (target) => {
          auditTarget = target;
        },
      };

      const result = await fn(ctx, { params, query, body } as RouteInput<TParams, TQuery, TBody>);

      // -- 6. response validation -------------------------------------------
      const status = anyRoute.status ?? 200;
      if (container.env.VALIDATE_RESPONSES && status !== 204) {
        const parsed = anyRoute.response.safeParse(result);
        if (!parsed.success) {
          const details = issuesOf(parsed.error, 'response');
          logger.error({ details }, 'response does not match its contract');
          return fail(
            new DomainError('INTERNAL', {
              ...(isProduction(container.env) ? {} : { details }),
            }),
          );
        }
      }

      // -- 7. audit ----------------------------------------------------------
      if (surface === 'admin' && actor.kind === 'admin' && MUTATING.has(request.method)) {
        await writeAudit(container, {
          actor,
          routeId: anyRoute.id,
          method: request.method,
          path: url.pathname,
          target: auditTarget,
          status,
          payload: parsedBody,
          requestId,
          ip: request.headers.get('x-forwarded-for'),
        });
      }

      return finish(status, result);
    } catch (error) {
      if (DomainError.is(error)) {
        if (error.unregistered) {
          logger.error({ code: error.code }, 'DomainError with an unregistered code');
        }
        return fail(error);
      }
      // Never leak an internal message, a stack, or a SQL string.
      logger.error({ err: error }, 'unhandled error');
      return fail(new DomainError('INTERNAL'));
    }
  };
}

function baseCtx(
  container: Container,
  actor: Actor,
  platform: ClientPlatform | null,
  requestId: string,
  routeId: string,
): Ctx {
  return createCtx({
    db: container.db,
    redis: container.redis,
    clock: container.clock,
    config: container.config,
    logger: container.logger.child({ requestId, routeId }),
    queue: container.queue,
    storage: container.storage,
    actor,
    platform,
    requestId,
    routeId,
  });
}

async function writeAudit(
  container: Container,
  entry: {
    actor: Actor;
    routeId: string;
    method: string;
    path: string;
    target: string | null;
    status: number;
    payload: unknown;
    requestId: string;
    ip: string | null;
  },
): Promise<void> {
  try {
    await insertAudit(container.db, {
      adminId: entry.actor.id,
      adminAccount: entry.actor.display ?? '',
      routeId: entry.routeId,
      method: entry.method,
      path: entry.path,
      target: entry.target,
      status: entry.status,
      payload: entry.payload,
      requestId: entry.requestId,
      ip: entry.ip,
      now: container.clock.now(),
    });
  } catch (error) {
    // An audit failure must never turn a successful operation into a 500.
    container.logger.error({ err: error, routeId: entry.routeId }, 'failed to write audit log');
  }
}
