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

/**
 * Answers `Taro.request` (the weapp transport the tests run on) from a table keyed by
 * `"METHOD /path"` (no query string). Unknown routes answer 404, so a test sees which call it
 * forgot. Returns what was asked, in order.
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
