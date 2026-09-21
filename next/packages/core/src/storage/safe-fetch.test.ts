import { describe, expect, it, vi } from 'vitest';
import { classifyAddress, safeFetch, SafeFetchError } from './safe-fetch';

/**
 * The SSRF guard.
 *
 * The old `onlineUpload` called `file_get_contents($url)`. Everything below is
 * a request that would have succeeded there and must fail here — including the
 * two that a hostname blocklist does not stop: a public name that *resolves* to
 * a private address, and a public URL that *redirects* to one.
 */

const PUBLIC_IP = '93.184.216.34';

function fetchReturning(
  body: Uint8Array | null,
  init: { status?: number; headers?: Record<string, string> } = {},
): { impl: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const impl = (async (url: string | URL) => {
    calls.push(String(url));
    return new Response(body, { status: init.status ?? 200, headers: init.headers ?? {} });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

async function refusal(promise: Promise<unknown>): Promise<SafeFetchError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof SafeFetchError) return error;
    throw error;
  }
  throw new Error('expected a SafeFetchError');
}

describe('classifyAddress', () => {
  it('blocks every address family a fetch must never reach', () => {
    const blocked = [
      '127.0.0.1',
      '127.1.2.3',
      '10.0.0.1',
      '172.16.5.4',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254', // AWS/Aliyun instance metadata
      '100.64.0.1', // carrier-grade NAT
      '0.0.0.0',
      '224.0.0.1',
      '255.255.255.255',
      '::1',
      '::',
      'fe80::1',
      'fd00::1',
      'ff02::1',
      '::ffff:169.254.169.254', // the IPv4-mapped bypass
      '::ffff:127.0.0.1',
      '64:ff9b::1', // NAT64
      '2002:7f00:1::', // 6to4
    ];
    for (const address of blocked) {
      expect(classifyAddress(address), address).toMatchObject({ blocked: true });
    }
  });

  it('allows ordinary public addresses', () => {
    for (const address of [PUBLIC_IP, '8.8.8.8', '1.1.1.1', '2606:4700::1111']) {
      expect(classifyAddress(address), address).toEqual({ blocked: false });
    }
  });

  it('blocks anything that is not an IP address at all', () => {
    expect(classifyAddress('localhost')).toMatchObject({ blocked: true });
    expect(classifyAddress('')).toMatchObject({ blocked: true });
  });
});

describe('safeFetch — refusals', () => {
  const resolve = async (): Promise<string[]> => [PUBLIC_IP];

  it('refuses non-http schemes', async () => {
    for (const url of ['file:///etc/passwd', 'ftp://example.com/x', 'gopher://example.com']) {
      expect((await refusal(safeFetch(url, { resolve }))).kind).toBe('refused');
    }
  });

  it('refuses credentials in the URL', async () => {
    const error = await refusal(safeFetch('http://user:pass@example.com/a.png', { resolve }));
    expect(error.message).toBe('credentials in URL');
  });

  it('refuses a non-standard port, so this is not a port scanner', async () => {
    expect((await refusal(safeFetch('http://example.com:6379/', { resolve }))).message).toBe(
      'port 6379',
    );
    // Unless the operator allowed it explicitly.
    const { impl } = fetchReturning(new Uint8Array([1]));
    await expect(
      safeFetch('http://example.com:8080/a.png', {
        resolve,
        fetchImpl: impl,
        allowedPorts: [8080],
      }),
    ).resolves.toMatchObject({ url: 'http://example.com:8080/a.png' });
  });

  it('refuses a literal private address', async () => {
    expect((await refusal(safeFetch('http://169.254.169.254/latest/meta-data/'))).kind).toBe(
      'refused',
    );
    expect((await refusal(safeFetch('http://127.0.0.1:80/'))).kind).toBe('refused');
    expect((await refusal(safeFetch('http://[::1]/'))).kind).toBe('refused');
  });

  it('refuses hostnames that exist to be loopback', async () => {
    for (const url of ['http://localhost/a', 'http://foo.localhost/a', 'http://db.internal/a']) {
      expect((await refusal(safeFetch(url))).message).toBe('loopback hostname');
    }
  });

  // The two that a blocklist does not catch.

  it('refuses a public name that RESOLVES to a private address', async () => {
    // `localtest.me` and friends are public names with an A record of 127.0.0.1.
    const error = await refusal(
      safeFetch('http://totally-normal.example.com/a.png', {
        resolve: async () => ['127.0.0.1'],
      }),
    );
    expect(error.kind).toBe('refused');
    expect(error.message).toBe('loopback');
  });

  it('refuses a name that resolves to one public AND one private address', async () => {
    // A multi-homed CDN does not answer with 10.0.0.5. A rebinding attempt does.
    const error = await refusal(
      safeFetch('http://example.com/a.png', { resolve: async () => [PUBLIC_IP, '10.0.0.5'] }),
    );
    expect(error.kind).toBe('refused');
  });

  it('refuses a redirect into the private network', async () => {
    const impl = (async (url: string | URL) => {
      if (String(url).includes('/start')) {
        return new Response(null, {
          status: 302,
          headers: { location: 'http://169.254.169.254/latest/meta-data/' },
        });
      }
      return new Response(new Uint8Array([1]));
    }) as unknown as typeof fetch;

    const error = await refusal(
      safeFetch('http://example.com/start', { resolve, fetchImpl: impl }),
    );
    expect(error.kind).toBe('refused');
  });

  it('stops after too many redirects', async () => {
    const impl = (async () =>
      new Response(null, {
        status: 302,
        headers: { location: 'http://example.com/next' },
      })) as unknown as typeof fetch;
    const error = await refusal(
      safeFetch('http://example.com/a', { resolve, fetchImpl: impl, maxRedirects: 2 }),
    );
    expect(error.message).toBe('too many redirects');
  });

  it('stops reading at maxBytes even when Content-Length lied', async () => {
    const impl = (async () =>
      new Response(new Uint8Array(4096), {
        headers: { 'content-length': '10' },
      })) as unknown as typeof fetch;
    const error = await refusal(
      safeFetch('http://example.com/big', { resolve, fetchImpl: impl, maxBytes: 1024 }),
    );
    expect(error.kind).toBe('failed');
    expect(error.message).toBe('too large');
  });

  it('refuses a declared Content-Length over the ceiling before reading', async () => {
    const { impl } = fetchReturning(new Uint8Array([1]), {
      headers: { 'content-length': String(50 * 1024 * 1024) },
    });
    expect(
      (await refusal(safeFetch('http://example.com/big', { resolve, fetchImpl: impl }))).message,
    ).toBe('too large');
  });

  it('reports an upstream error as a failure, not a refusal', async () => {
    const { impl } = fetchReturning(null, { status: 503 });
    expect(
      (await refusal(safeFetch('http://example.com/a', { resolve, fetchImpl: impl }))).kind,
    ).toBe('failed');
  });
});

describe('safeFetch — the happy path', () => {
  it('connects to the address it judged, presenting the original Host', async () => {
    // This is what closes the DNS-rebinding window: there is no second lookup
    // between the check and the connection for anybody to win.
    const seen: Array<{ url: string; host: unknown }> = [];
    const impl = (async (url: string | URL, init?: { headers?: Record<string, string> }) => {
      seen.push({ url: String(url), host: init?.headers?.['host'] });
      return new Response(new Uint8Array([0x89, 0x50]), {
        headers: { 'content-type': 'image/png' },
      });
    }) as unknown as typeof fetch;

    const result = await safeFetch('https://cdn.example.com/banner.png', {
      resolve: async () => [PUBLIC_IP],
      fetchImpl: impl,
    });

    expect(seen[0]?.url).toBe(`https://${PUBLIC_IP}/banner.png`);
    expect(seen[0]?.host).toBe('cdn.example.com');
    expect(result.contentType).toBe('image/png');
    expect(result.bytes).toEqual(new Uint8Array([0x89, 0x50]));
    // The *name* is reported back, not the IP we dialled.
    expect(result.url).toBe('https://cdn.example.com/banner.png');
  });

  it('re-judges the hostname of a relative redirect against the real host', async () => {
    const resolve = vi.fn(async () => [PUBLIC_IP]);
    const impl = (async (url: string | URL) => {
      if (String(url).endsWith('/a')) {
        return new Response(null, { status: 301, headers: { location: '/b.png' } });
      }
      return new Response(new Uint8Array([1]));
    }) as unknown as typeof fetch;

    const result = await safeFetch('https://cdn.example.com/a', { resolve, fetchImpl: impl });
    expect(result.url).toBe('https://cdn.example.com/b.png');
    // Resolved again for the second hop rather than reusing the first verdict.
    expect(resolve).toHaveBeenCalledTimes(2);
  });
});
