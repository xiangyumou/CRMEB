import { storefrontRouteList } from '@shop/api-client';
import { contractOf } from '@shop/api-client/validate';
import { taroFake } from './taro-fake/taro';

export interface FakeReply {
  status?: number;
  body: unknown;
  headers?: Record<string, string>;
}

export interface SeenRequest {
  key: string;
  /** The query string, decoded (a repeated key's values joined by commas). */
  query: Record<string, string>;
  headers: Record<string, string>;
  body: unknown;
}

const ROUTES = storefrontRouteList.map((meta) => ({
  meta,
  re: new RegExp(
    `^${meta.path
      .split('/')
      .map((segment) =>
        segment.startsWith(':') ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      )
      .join('/')}$`,
  ),
}));

// A literal segment wins over a `:param` (`/orders/counts` before `/orders/:id`).
ROUTES.sort((a, b) => a.meta.path.split(':').length - b.meta.path.split(':').length);

function routeOf(method: string, path: string) {
  return ROUTES.find((route) => route.meta.method === method && route.re.test(path))?.meta;
}

/**
 * Where a stub and the contract disagree, collected while a test runs and failed after it
 * (src/test/setup.ts). A stub the server could never send — a 204 for a route that answers
 * `{ ok: true }`, a success for a body it would refuse — lets a test pass on a page that breaks
 * against the real server (78a56cfe2).
 */
export const contractMismatches: string[] = [];

function checkAgainstContract(
  key: string,
  method: string,
  path: string,
  body: unknown,
  reply: FakeReply,
) {
  const meta = routeOf(method, path);
  if (!meta) return;
  const route = contractOf(meta.id);
  if (body !== undefined && route.body) {
    const parsed = route.body.safeParse(body);
    if (!parsed.success) {
      contractMismatches.push(
        `${key}: the page sent a body ${meta.id} refuses: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`,
      );
    }
  }
  const status = reply.status ?? 200;
  if (status < 200 || status >= 300) return;
  const expected = route.status ?? 200;
  if (status !== expected) {
    contractMismatches.push(`${key}: the stub answers ${status}, ${meta.id} answers ${expected}`);
    return;
  }
  if (expected === 204) return;
  const parsed = route.response.safeParse(reply.body);
  if (!parsed.success) {
    contractMismatches.push(
      `${key}: the stub's body is not a ${meta.id} response: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')} ${i.message}`)
        .join('; ')}`,
    );
  }
}

/**
 * Answers `Taro.request` (the weapp transport the tests run on) from a table keyed by
 * `"METHOD /path"` (no query string). Unknown routes answer 404, so a test sees which call it
 * forgot. Every answer to a storefront route, and every body sent to one, is checked against
 * its contract (`contractMismatches`). Returns what was asked, in order.
 */
export function serveApi(routes: Record<string, (body: unknown) => FakeReply>): SeenRequest[] {
  const seen: SeenRequest[] = [];
  taroFake.onRequest = (option) => {
    const [path = '', search = ''] = option.url.replace(/^https?:\/\/[^/]+/, '').split('?');
    const query: Record<string, string> = {};
    for (const [name, value] of new URLSearchParams(search))
      query[name] = name in query ? `${query[name]},${value}` : value;
    const key = `${option.method} ${path}`;
    const body: unknown = option.data === undefined ? undefined : JSON.parse(option.data);
    seen.push({ key, query, headers: option.header, body });
    const handler = routes[key];
    const reply = handler
      ? handler(body)
      : { status: 404, body: { code: 'NOT_FOUND', message: `no fake for ${key}` } };
    if (handler) checkAgainstContract(key, option.method, path, body, reply);
    return {
      statusCode: reply.status ?? 200,
      data: JSON.stringify(reply.body),
      ...(reply.headers ? { header: reply.headers } : {}),
    };
  };
  return seen;
}

/**
 * Holds every answer to a path ending in `path` (after `serveApi`) until `release()`: what went
 * out while it was pending shows which requests ran side by side.
 */
export function holdRequests(path: string): { release: () => void } {
  const answer = taroFake.onRequest;
  const waiting: Array<() => void> = [];
  taroFake.onRequest = (option) =>
    option.url.split('?')[0]?.endsWith(path)
      ? new Promise((resolve) => waiting.push(() => resolve(answer(option))))
      : answer(option);
  return { release: () => waiting.splice(0).forEach((go) => go()) };
}
