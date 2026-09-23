import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestCtx, type TestCtx } from '@shop/testing';
import { anonymousActor, type Actor, type Ctx } from '../kernel/context';
import { DomainError } from '../kernel/errors';
import { storageConfig, type Transport } from '../storage';
import { attachmentDataUrl, type AttachmentDataUrlOptions } from './attachment.service';
import { siteConfig } from './site.config';

/**
 * `POST /api/v1/attachments/base64` (CR-7-h2 §2).
 *
 * The legacy `get_image_base64` did `file_get_contents` on a URL the caller
 * supplied, with an allow-list that contained `$request->host()` — the header
 * the caller sends. Every test below is a request that would have succeeded
 * there.
 *
 * The fetch is seamed rather than real, because every address this endpoint is
 * *allowed* to reach is a public one: a socket-level happy path would mean
 * binding a public address in CI. The refusals are the point anyway, and the
 * seam is what lets the DNS-rebinding one be a test at all.
 */

let harness: TestCtx;

const NOW = '2026-09-22T08:00:00.000Z';
const ORIGIN = 'https://shop.example.test';
const PUBLIC_IP = '93.184.216.34';

/** The eight bytes of a PNG signature, then a little payload. */
function png(bytes = 64): Uint8Array {
  const out = new Uint8Array(bytes);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  return out;
}

interface Seam extends AttachmentDataUrlOptions {
  calls: string[];
}

/** A resolver and a transport that answer with `body`, recording what was asked. */
function seam(body: Uint8Array | string, addresses: string[] = [PUBLIC_IP]): Seam {
  const calls: string[] = [];
  const impl: Transport = async ({ url }) => {
    calls.push(String(url));
    return new Response(body, { status: 200 });
  };
  return { calls, fetch: { resolve: async () => addresses, transport: impl } };
}

let userSequence = 0;

function shopper(): Ctx {
  userSequence += 1;
  const actor: Actor = { kind: 'user', id: userSequence, permissions: [], isSuper: false };
  return harness.ctx.as(actor);
}

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  throw new Error('expected a DomainError');
}

beforeAll(async () => {
  harness = await createTestCtx({ now: NOW });
}, 180_000);

afterAll(async () => {
  await harness?.close();
});

beforeEach(async () => {
  await harness.db.truncateAll();
  // `truncateAll` empties the tables and leaves the config cache alone, and
  // `config.set` writes only the keys that differ from what it reads — which
  // it reads through that cache. Without these two lines a group whose value
  // the previous test happened to leave cached is silently not re-written, and
  // the test runs against the schema defaults.
  for (const group of ['site', 'storage']) await harness.ctx.config.invalidate(group);
  await harness.ctx.config.set(siteConfig, { publicOrigin: ORIGIN });
});

describe('图片转 base64 (CR-7-h2)', () => {
  it('returns our own attachment as a data URL', async () => {
    const s = seam(png());
    const result = await attachmentDataUrl(
      shopper(),
      { url: '/uploads/attachment/2026/09/a.png' },
      s,
    );
    expect(result.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    // Resolved against the *configured* origin, never against a request header.
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]).toContain('/uploads/attachment/2026/09/a.png');
  });

  it('takes an absolute URL on an origin this deployment states it serves', async () => {
    await harness.ctx.config.set(siteConfig, {
      publicOrigin: ORIGIN,
      extraOrigins: 'staging.example.test',
    });
    for (const url of [`${ORIGIN}/uploads/a.png`, 'https://staging.example.test/uploads/a.png']) {
      const s = seam(png());
      expect((await attachmentDataUrl(shopper(), { url }, s)).dataUrl).toContain('image/png');
    }
  });

  it('refuses a foreign host without fetching anything at all', async () => {
    const s = seam(png());
    expect(await code(attachmentDataUrl(shopper(), { url: 'https://evil.test/a.png' }, s))).toBe(
      'ATTACHMENT_URL_NOT_ALLOWED',
    );
    // Not "refused after downloading it": the decision is taken first.
    expect(s.calls).toEqual([]);
  });

  it('refuses a host of ours that resolves to a private address', async () => {
    // DNS rebinding, which is what a hostname allow-list alone never catches:
    // the host is genuinely one of ours, and the answer is 10.0.0.5.
    const s = seam(png(), ['10.0.0.5']);
    expect(await code(attachmentDataUrl(shopper(), { url: `${ORIGIN}/uploads/a.png` }, s))).toBe(
      'ATTACHMENT_URL_NOT_ALLOWED',
    );
    expect(s.calls).toEqual([]);
  });

  it('refuses a public answer that comes with a private one', async () => {
    const s = seam(png(), [PUBLIC_IP, '127.0.0.1']);
    expect(await code(attachmentDataUrl(shopper(), { url: `${ORIGIN}/uploads/a.png` }, s))).toBe(
      'ATTACHMENT_URL_NOT_ALLOWED',
    );
  });

  it('refuses a body over the 2 MB cap', async () => {
    const s = seam(png(3 * 1024 * 1024));
    expect(await code(attachmentDataUrl(shopper(), { url: '/uploads/big.png' }, s))).toBe(
      'ATTACHMENT_URL_NOT_ALLOWED',
    );
  });

  it('refuses bytes that are not an image, whatever the URL says', async () => {
    // `.png` and a 200: the only thing consulted is the signature.
    const s = seam('<html><script>alert(1)</script></html>');
    expect(await code(attachmentDataUrl(shopper(), { url: '/uploads/not-really.png' }, s))).toBe(
      'ATTACHMENT_URL_NOT_ALLOWED',
    );
  });

  it('refuses an SVG, which is a document rather than an image', async () => {
    const s = seam('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(await code(attachmentDataUrl(shopper(), { url: '/uploads/logo.svg' }, s))).toBe(
      'ATTACHMENT_URL_NOT_ALLOWED',
    );
  });

  it('refuses every scheme that is not http(s), and credentials in the URL', async () => {
    for (const url of [
      'file:///etc/passwd',
      'gopher://example.test/x',
      'phar://uploads/a.png',
      'https://user:pass@shop.example.test/uploads/a.png',
      '//evil.test/a.png',
    ]) {
      const s = seam(png());
      expect(await code(attachmentDataUrl(shopper(), { url }, s)), url).toBe(
        'ATTACHMENT_URL_NOT_ALLOWED',
      );
      expect(s.calls, url).toEqual([]);
    }
  });

  it('refuses a path when nobody told this deployment its own origin', async () => {
    // `''` is a real state — no `PUBLIC_ORIGIN` in the environment — and it
    // means "there is no such thing as ours", not "everything is ours".
    await harness.ctx.config.set(siteConfig, { publicOrigin: '' });
    const s = seam(png());
    expect(await code(attachmentDataUrl(shopper(), { url: '/uploads/a.png' }, s))).toBe(
      'ATTACHMENT_URL_NOT_ALLOWED',
    );
    expect(s.calls).toEqual([]);
  });

  it('takes an object-storage URL only under the configured prefix', async () => {
    await harness.ctx.config.set(storageConfig, {
      s3PublicBaseUrl: 'https://cdn.example.test/shop-a',
    });
    const ok = seam(png());
    expect(
      (await attachmentDataUrl(shopper(), { url: 'https://cdn.example.test/shop-a/x.png' }, ok))
        .dataUrl,
    ).toContain('image/png');

    // A shared bucket domain does not vouch for the whole domain.
    const no = seam(png());
    expect(
      await code(
        attachmentDataUrl(shopper(), { url: 'https://cdn.example.test/shop-a-evil/x.png' }, no),
      ),
    ).toBe('ATTACHMENT_URL_NOT_ALLOWED');
    expect(no.calls).toEqual([]);
  });

  it('is rate limited per shopper', async () => {
    const ctx = shopper();
    for (let i = 0; i < 60; i += 1) {
      await attachmentDataUrl(ctx, { url: `/uploads/${i}.png` }, seam(png()));
    }
    expect(await code(attachmentDataUrl(ctx, { url: '/uploads/61.png' }, seam(png())))).toBe(
      'RATE_LIMITED',
    );
    // Somebody else's budget is their own.
    expect(
      (await attachmentDataUrl(shopper(), { url: '/uploads/a.png' }, seam(png()))).dataUrl,
    ).toContain('image/png');
  });

  it('needs a storefront session', async () => {
    expect(
      await code(attachmentDataUrl(harness.ctx.as(anonymousActor), { url: '/uploads/a.png' })),
    ).toBe('UNAUTHENTICATED');
  });
});
