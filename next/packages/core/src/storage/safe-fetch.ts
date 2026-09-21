import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Fetching a URL somebody typed into the admin, without handing them the
 * internal network.
 *
 * CONVENTIONS: "Never: … `fetch` of a user-supplied URL outside
 * `core/storage/safe-fetch.ts`". This is that file, and it is the only place in
 * the system allowed to do it.
 *
 * The old `onlineUpload` did `file_get_contents($url)`. That reaches
 * `http://127.0.0.1:6379`, `http://169.254.169.254/latest/meta-data/` and every
 * service on the private network, and a blocklist of hostnames does not stop any
 * of it: `localtest.me` resolves to 127.0.0.1, and a host you checked a moment
 * ago can answer differently the next time (DNS rebinding).
 *
 * So the rule here is **resolve first, judge the address, then connect to that
 * address** — and do it again for every redirect:
 *
 * 1. scheme must be `http:` or `https:`; no `file:`, `ftp:`, `gopher:`, no
 *    credentials in the URL, no non-standard port unless allowed;
 * 2. resolve the hostname ourselves, and refuse if *any* resolved address is
 *    private, loopback, link-local, unique-local, multicast, broadcast,
 *    unspecified, carrier-grade NAT, or a cloud metadata address;
 * 3. connect by IP with the original `Host` header, so the address we judged is
 *    the address we talk to, and DNS cannot change its mind in between;
 * 4. follow redirects manually, re-running all of the above on each hop;
 * 5. stop reading at `maxBytes` — a 4-byte URL must not be able to buy a 40GB
 *    download.
 */

export interface SafeFetchOptions {
  /** Hard ceiling on the response body. Reading stops here and it is refused. */
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  /** Ports other than 80/443. Empty by default: port scanning is not a feature. */
  allowedPorts?: readonly number[];
  /**
   * Test seam. Production resolves through the system resolver; the tests
   * substitute one so "what happens when this name resolves to 127.0.0.1" is a
   * fast, deterministic unit test rather than a network-dependent one.
   */
  resolve?: (hostname: string) => Promise<string[]>;
  fetchImpl?: typeof fetch;
}

export interface SafeFetchResult {
  bytes: Uint8Array;
  /** The server's `Content-Type`, untrusted — the caller still sniffs the bytes. */
  contentType: string | undefined;
  /** The final URL after redirects. */
  url: string;
}

export class SafeFetchError extends Error {
  constructor(
    readonly kind: 'refused' | 'failed',
    message: string,
  ) {
    super(message);
    this.name = 'SafeFetchError';
  }
}

const DEFAULTS = {
  maxBytes: 20 * 1024 * 1024,
  timeoutMs: 8000,
  maxRedirects: 3,
} as const;

// ---------------------------------------------------------------------------
// address judgement
// ---------------------------------------------------------------------------

function ipv4ToInt(address: string): number | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = (value << 8) | n;
  }
  return value >>> 0;
}

/** CIDR blocks that must never be reachable from a user-supplied URL. */
const BLOCKED_V4: ReadonlyArray<readonly [string, number, string]> = [
  ['0.0.0.0', 8, 'unspecified'],
  ['10.0.0.0', 8, 'private'],
  ['100.64.0.0', 10, 'carrier-grade NAT'],
  ['127.0.0.0', 8, 'loopback'],
  ['169.254.0.0', 16, 'link-local / cloud metadata'],
  ['172.16.0.0', 12, 'private'],
  ['192.0.0.0', 24, 'IETF protocol assignments'],
  ['192.0.2.0', 24, 'documentation'],
  ['192.88.99.0', 24, '6to4 relay anycast'],
  ['192.168.0.0', 16, 'private'],
  ['198.18.0.0', 15, 'benchmarking'],
  ['198.51.100.0', 24, 'documentation'],
  ['203.0.113.0', 24, 'documentation'],
  ['224.0.0.0', 4, 'multicast'],
  ['240.0.0.0', 4, 'reserved'],
];

export function classifyAddress(
  address: string,
): { blocked: true; reason: string } | { blocked: false } {
  const family = isIP(address);
  if (family === 4) {
    const value = ipv4ToInt(address);
    if (value === null) return { blocked: true, reason: 'unparseable address' };
    for (const [base, bits, reason] of BLOCKED_V4) {
      const baseValue = ipv4ToInt(base);
      if (baseValue === null) continue;
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      if ((value & mask) === (baseValue & mask)) return { blocked: true, reason };
    }
    return { blocked: false };
  }

  if (family === 6) {
    const normalised = address.toLowerCase().replace(/^\[|\]$/g, '');
    // IPv4-mapped (`::ffff:169.254.169.254`) is the classic bypass: judge the
    // embedded v4 address, not the v6 spelling.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalised);
    if (mapped?.[1]) return classifyAddress(mapped[1]);
    if (normalised === '::') return { blocked: true, reason: 'unspecified' };
    if (normalised === '::1') return { blocked: true, reason: 'loopback' };
    if (normalised.startsWith('fe80:')) return { blocked: true, reason: 'link-local' };
    if (/^f[cd]/.test(normalised)) return { blocked: true, reason: 'unique local' };
    if (normalised.startsWith('ff')) return { blocked: true, reason: 'multicast' };
    if (normalised.startsWith('64:ff9b:')) return { blocked: true, reason: 'NAT64' };
    if (normalised.startsWith('2002:')) return { blocked: true, reason: '6to4' };
    return { blocked: false };
  }

  return { blocked: true, reason: 'not an IP address' };
}

/**
 * `URL.hostname` keeps the brackets around an IPv6 literal (`[::1]`), and
 * `isIP` does not accept them — so an unnormalised host would slip past the
 * literal-address check and be handed to the resolver instead.
 */
function normaliseHost(hostname: string): string {
  return hostname
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^\[|\]$/g, '');
}

/** Hostnames that resolve to loopback on purpose and are not worth arguing with. */
const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.localdomain'];

function judgeUrl(raw: string, allowedPorts: readonly number[]): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SafeFetchError('refused', 'not a URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SafeFetchError('refused', `scheme ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new SafeFetchError('refused', 'credentials in URL');
  }
  const host = normaliseHost(url.hostname);
  if (host === 'localhost' || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new SafeFetchError('refused', 'loopback hostname');
  }
  const port = url.port === '' ? (url.protocol === 'https:' ? 443 : 80) : Number(url.port);
  if (port !== 80 && port !== 443 && !allowedPorts.includes(port)) {
    throw new SafeFetchError('refused', `port ${port}`);
  }
  // A literal IP is judged here; a name is judged after resolution.
  if (isIP(host) !== 0) {
    const verdict = classifyAddress(host);
    if (verdict.blocked) throw new SafeFetchError('refused', verdict.reason);
  }
  return url;
}

async function resolveAndJudge(
  hostname: string,
  resolver: (hostname: string) => Promise<string[]>,
): Promise<string> {
  const host = normaliseHost(hostname);
  if (isIP(host) !== 0) return host;

  let addresses: string[];
  try {
    addresses = await resolver(host);
  } catch {
    throw new SafeFetchError('failed', 'DNS lookup failed');
  }
  if (addresses.length === 0) throw new SafeFetchError('failed', 'no addresses');

  // *Every* answer must be public. A name that resolves to one public and one
  // private address is a rebinding attempt, not a multi-homed CDN.
  for (const address of addresses) {
    const verdict = classifyAddress(address);
    if (verdict.blocked) throw new SafeFetchError('refused', verdict.reason);
  }
  return addresses[0]!;
}

async function systemResolve(hostname: string): Promise<string[]> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((r) => r.address);
}

// ---------------------------------------------------------------------------
// the fetch
// ---------------------------------------------------------------------------

export async function safeFetch(
  raw: string,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const maxBytes = options.maxBytes ?? DEFAULTS.maxBytes;
  const timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
  const maxRedirects = options.maxRedirects ?? DEFAULTS.maxRedirects;
  const allowedPorts = options.allowedPorts ?? [];
  const resolver = options.resolve ?? systemResolve;
  const doFetch = options.fetchImpl ?? fetch;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();

  try {
    let current = raw;
    for (let hop = 0; hop <= maxRedirects; hop += 1) {
      const url = judgeUrl(current, allowedPorts);
      const address = await resolveAndJudge(url.hostname, resolver);

      // Connect to the address we judged, presenting the original Host. This is
      // what closes the rebinding window: between the check and the connection
      // there is no second DNS lookup for anybody to win.
      const target = new URL(url.toString());
      const literal = isIP(address) === 6 ? `[${address}]` : address;
      target.hostname = literal;

      let response: Response;
      try {
        response = await doFetch(target.toString(), {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            host: url.host,
            accept: '*/*',
            'user-agent': 'crmeb-next/1.0 (+attachment import)',
          },
        });
      } catch (error) {
        if (error instanceof SafeFetchError) throw error;
        throw new SafeFetchError('failed', 'request failed');
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new SafeFetchError('failed', 'redirect without Location');
        // Resolved against the *original* URL, not the IP-literal one, so a
        // relative redirect keeps the real hostname.
        current = new URL(location, url).toString();
        continue;
      }

      if (!response.ok) throw new SafeFetchError('failed', `status ${response.status}`);

      const declaredLength = Number(response.headers.get('content-length') ?? '');
      if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        throw new SafeFetchError('failed', 'too large');
      }

      const bytes = await readBounded(response, maxBytes);
      return {
        bytes,
        contentType: response.headers.get('content-type') ?? undefined,
        url: url.toString(),
      };
    }
    throw new SafeFetchError('failed', 'too many redirects');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reads the body, stopping at `maxBytes`.
 *
 * Not `await response.arrayBuffer()`: that buffers whatever the server decides
 * to send, and `Content-Length` is a claim, not a promise.
 */
async function readBounded(response: Response, maxBytes: number): Promise<Uint8Array> {
  const body = response.body;
  if (!body) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) throw new SafeFetchError('failed', 'too large');
    return buffer;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) throw new SafeFetchError('failed', 'too large');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
