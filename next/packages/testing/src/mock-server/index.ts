import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { z } from 'zod';
import type { AnyRouteDef, RouteExample } from '@shop/contracts/conventions';
import { allRoutes } from '@shop/contracts/routes';
// The mock must produce the same 422 bodies the real handler does.
import '@shop/contracts/locale';

/**
 * The contract mock server.
 *
 * PLAN §3: "每个流的第一个交付物是契约 PR … uni-app 流由此对着 mock server 开工,
 * 不等任何后端实现". This is that server. It knows nothing about the domain: it
 * answers every registered route with an example from the contract, and it
 * validates whatever the client sent against the contract's zod schemas — so a
 * client developed against it cannot drift from the real API.
 *
 *  - response: the route's **first** example, or the one named by the
 *    `X-Mock-Example` request header;
 *  - params / query / body that do not parse: `422 VALIDATION_FAILED` in
 *    exactly the shape `handle()` produces, field errors included;
 *  - unknown path: `404 NOT_FOUND`; known path, wrong method: `405`.
 *
 * It deliberately does **not** check auth. A mock that rejected an unauthenticated
 * call would force every client developer to build a login flow first, which is
 * the opposite of the point. `X-Mock-Example` covers the "what does a 403 look
 * like" case instead.
 */

export interface MockServerOptions {
  port?: number;
  host?: string;
  routes?: readonly AnyRouteDef[];
  /** Logged per request when true. */
  verbose?: boolean;
}

export interface RunningMockServer {
  server: Server;
  port: number;
  url: string;
  close(): Promise<void>;
}

interface CompiledRoute {
  route: AnyRouteDef;
  regex: RegExp;
  paramNames: string[];
}

export function compileRoute(route: AnyRouteDef): CompiledRoute {
  const paramNames: string[] = [];
  const pattern = route.path
    .split('/')
    .map((segment) => {
      if (!segment.startsWith(':')) return escapeRegex(segment);
      paramNames.push(segment.slice(1));
      return '([^/]+)';
    })
    .join('/');
  return { route, regex: new RegExp(`^${pattern}$`), paramNames };
}

/**
 * Compares segment by segment; the first position where only one side is static
 * decides. Ties break on the path, which is what makes this a **total order**
 * and is not cosmetic.
 *
 * Without the tie-break this returns 0 for every pair of unrelated paths, and a
 * comparator that reports 0 for pairs it cannot order is not transitive: `a < b`
 * and `b == c` and `c == a` can all hold at once. `Array.prototype.sort` is
 * allowed to do anything with such a comparator, and TimSort only compares a
 * subset of the pairs — so two routes that *are* ordered relative to each other
 * can still come out the wrong way round, depending on where the sort happens to
 * place them, which depends on the order the routes were registered in.
 *
 * That is how this surfaced: `/api/v1/my-messages/unread-count` and
 * `/api/v1/my-messages/:id` were ordered correctly for 397 routes and
 * incorrectly for 398, so adding one unrelated route (`/api/v1/readyz`) made the
 * static path lose to the dynamic one and the mock server answered a request for
 * the unread count with a 422 about an id that was not a number. Nothing about
 * either route had changed.
 */
function bySpecificity(a: CompiledRoute, b: CompiledRoute): number {
  const left = a.route.path.split('/');
  const right = b.route.path.split('/');
  for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
    const leftParam = left[i]?.startsWith(':') ?? false;
    const rightParam = right[i]?.startsWith(':') ?? false;
    if (leftParam !== rightParam) return leftParam ? 1 : -1;
  }
  if (a.route.path !== b.route.path) return a.route.path < b.route.path ? -1 : 1;
  return 0;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fieldErrors(error: z.ZodError): Array<{ field: string; message: string }> {
  return error.issues.map((issue) => ({
    field: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  });
  res.end(payload);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return undefined;
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (raw.length === 0) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return Symbol.for('mock.invalid-json');
  }
}

export function pickExample(route: AnyRouteDef, name: string | undefined): RouteExample | null {
  if (!name) return route.examples[0] ?? null;
  return route.examples.find((example) => example.name === name) ?? null;
}

/** Exported so a unit test can exercise the routing without a socket. */
export function matchRoute(
  compiled: readonly CompiledRoute[],
  method: string,
  pathname: string,
): { route: AnyRouteDef; params: Record<string, string> } | 'method-not-allowed' | null {
  let pathMatched = false;
  for (const candidate of compiled) {
    const match = candidate.regex.exec(pathname);
    if (!match) continue;
    pathMatched = true;
    if (candidate.route.method !== method) continue;
    const params: Record<string, string> = {};
    candidate.paramNames.forEach((name, index) => {
      params[name] = decodeURIComponent(match[index + 1] ?? '');
    });
    return { route: candidate.route, params };
  }
  return pathMatched ? 'method-not-allowed' : null;
}

export async function startMockServer(options: MockServerOptions = {}): Promise<RunningMockServer> {
  const routes = options.routes ?? allRoutes;
  // Static segments beat `:param` ones, as in the App Router: `/refunds/applicable-items`
  // must not be captured by `/refunds/:id`.
  const compiled = routes.map(compileRoute).sort(bySpecificity);

  const server = createServer((req, res) => {
    void handleRequest(req, res, compiled, options.verbose ?? false);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 4010, options.host ?? '127.0.0.1', resolve);
  });

  const port = (server.address() as AddressInfo).port;
  return {
    server,
    port,
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  compiled: readonly CompiledRoute[],
  verbose: boolean,
): Promise<void> {
  const method = (req.method ?? 'GET').toUpperCase();
  const url = new URL(req.url ?? '/', 'http://mock.local');

  if (method === 'OPTIONS') {
    send(res, 204, null);
    return;
  }

  if (url.pathname === '/__mock/routes') {
    send(
      res,
      200,
      compiled.map((c) => ({
        id: c.route.id,
        method: c.route.method,
        path: c.route.path,
        examples: c.route.examples.map((e) => e.name),
      })),
    );
    return;
  }

  const matched = matchRoute(compiled, method, url.pathname);
  if (matched === null) {
    send(res, 404, { code: 'NOT_FOUND', message: '资源不存在', details: { path: url.pathname } });
    return;
  }
  if (matched === 'method-not-allowed') {
    send(res, 405, { code: 'NOT_FOUND', message: '资源不存在', details: { method } });
    return;
  }

  const { route, params } = matched;
  const problems: Array<{ field: string; message: string }> = [];

  if (route.params) {
    const parsed = route.params.safeParse(params);
    if (!parsed.success) problems.push(...fieldErrors(parsed.error));
  }
  if (route.query) {
    const query = Object.fromEntries(url.searchParams.entries());
    const parsed = route.query.safeParse(query);
    if (!parsed.success) problems.push(...fieldErrors(parsed.error));
  }
  if (route.body) {
    const body = await readBody(req);
    if (body === Symbol.for('mock.invalid-json')) {
      problems.push({ field: '<body>', message: '请求体不是合法的 JSON' });
    } else {
      const parsed = route.body.safeParse(body);
      if (!parsed.success) problems.push(...fieldErrors(parsed.error));
    }
  }

  if (problems.length > 0) {
    send(res, 422, { code: 'VALIDATION_FAILED', message: '提交的数据有误', details: problems });
    return;
  }

  const wanted = req.headers['x-mock-example'];
  const exampleName = Array.isArray(wanted) ? wanted[0] : wanted;
  const example = pickExample(route, exampleName);
  if (!example) {
    send(res, 404, {
      code: 'NOT_FOUND',
      message: '资源不存在',
      details: {
        reason: `no example named "${exampleName}"`,
        available: route.examples.map((e) => e.name),
      },
    });
    return;
  }

  if (verbose) {
    console.log(`${method} ${url.pathname} -> ${route.id} [${example.name}]`);
  }
  const status = route.status ?? 200;
  if (status === 204) {
    res.writeHead(204).end();
    return;
  }
  send(res, status, example.response);
}
