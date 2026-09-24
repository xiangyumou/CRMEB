/**
 * The pure half of the CLI: turning `--param id=3 --query tag=a --query tag=b`
 * into the objects `callOperation` takes. No I/O here, so it is tested as is.
 */

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

/**
 * `k=v` pairs into an object. A key given twice becomes an array — what a
 * repeated query key means to the server. Values stay strings: the routes
 * coerce query and path values themselves.
 */
export function parsePairs(
  pairs: readonly string[] | undefined,
  flag: string,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const pair of pairs ?? []) {
    const at = pair.indexOf('=');
    if (at <= 0) throw new UsageError(`${flag} 需要 key=value 的形式，收到：${pair}`);
    const key = pair.slice(0, at);
    const value = pair.slice(at + 1);
    const existing = out[key];
    out[key] =
      existing === undefined
        ? value
        : [...(Array.isArray(existing) ? existing : [existing]), value];
  }
  return out;
}

/**
 * `--body` as given: inline JSON, `@path` for a file, `@-` for stdin. The
 * reader is passed in so this stays free of `fs`.
 */
export async function parseBody(
  raw: string | undefined,
  read: (source: string) => Promise<string>,
): Promise<unknown> {
  if (raw === undefined) return undefined;
  const text = raw.startsWith('@') ? await read(raw.slice(1)) : raw;
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new UsageError(`--body 不是合法的 JSON：${(error as Error).message}`);
  }
}

/** `https://x-zoo.vip/` → `https://x-zoo.vip`; refuses what is not http(s). */
export function normaliseOrigin(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UsageError(`不是合法的网址：${raw}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new UsageError(`网址必须以 https:// 开头：${raw}`);
  }
  return url.origin;
}
