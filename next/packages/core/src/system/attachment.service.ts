import type { AttachmentDataUrl, AttachmentDataUrlBody } from '@shop/contracts/system/schemas';

import type { Ctx } from '../kernel/context';
import { requireUserId } from '../kernel/context';
import { DomainError } from '../kernel/errors';
import { enforce, fixedWindow } from '../kernel/rate-limit';
import {
  isRejected,
  safeFetch,
  SafeFetchError,
  sniffFileType,
  storageConfig,
  type SafeFetchOptions,
} from '../storage';
import { isTrustedHost, publicOrigin } from './site.config';

/**
 * `POST /api/v1/attachments/base64` — one of our own images, inline.
 *
 * ## Why this lives in `system`
 *
 * It is an attachment endpoint and the fetching is `storage`'s (`safeFetch` is
 * the only sanctioned way to fetch a user-supplied URL anywhere in the system).
 * But deciding *whose* URL it is means reading `site.publicOrigin` /
 * `extraOrigins`, and that answer lives here — `system/site.config.ts` is the
 * origin's one home. `system` already imports `storage` (the media tiles on the
 * dashboard); the edge back would be a cycle, and this file's sibling
 * `site.service.ts` carries the story of what a cycle in `core` costs. So the
 * composition happens on the side that is allowed to compose.
 *
 * ## What it refuses, and why it will not say which
 *
 * 1. A URL that is not a path on this deployment and not an absolute URL on an
 *    origin the deployment states it serves.
 * 2. Anything `safeFetch` refuses: a private, loopback, link-local or
 *    metadata address after DNS resolution, a non-`http(s)` scheme, a redirect
 *    to any of those.
 * 3. A body over 2 MB, counted as it arrives rather than believed from
 *    `Content-Length`.
 * 4. Bytes that are not an image, by signature — never by extension and never
 *    by the server's `Content-Type`. An SVG is not an image for this purpose
 *    and never will be: it is a document that can carry script, and a data URL
 *    of one is worse than a link to one.
 *
 * All four are `ATTACHMENT_URL_NOT_ALLOWED`, and so is a fetch that simply
 * fails. The distinction between "refused" and "could not connect" is exactly
 * the signal a scanner wants; it goes to the log instead.
 */

/** 2 MB. A 海报 element is a logo or a product photo, not a gallery original. */
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 5000;

/**
 * Image types allowed to come back as a data URL.
 *
 * Named here rather than taken as "whatever `sniffFileType` calls an image", so
 * that a format added to the uploader for some other reason does not silently
 * become fetchable. Every one of these is what the canvas can draw.
 */
const ALLOWED_MIME: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
]);

/**
 * A server-side fetch per request is a lever, even one pointed only at us.
 * Sixty an hour is more posters than anybody draws and far less than a useful
 * amplifier; the key is the shopper, because that is who the endpoint costs.
 */
const RATE_LIMIT_PER_HOUR = 60;

/**
 * Test seam, the same one `safeFetch` declares and for the same reason: every
 * address this endpoint is *allowed* to reach is a public one, so a test that
 * exercised the happy path over a real socket would have to bind a public
 * address. Production passes nothing and gets the system resolver and the
 * pinned transport (whose real-socket test is `storage/safe-fetch.tls.test.ts`).
 */
export interface AttachmentDataUrlOptions {
  fetch?: Pick<SafeFetchOptions, 'resolve' | 'transport'>;
}

export async function attachmentDataUrl(
  ctx: Ctx,
  body: AttachmentDataUrlBody,
  options: AttachmentDataUrlOptions = {},
): Promise<AttachmentDataUrl> {
  const userId = requireUserId(ctx);
  await enforce(
    fixedWindow(ctx.redis, {
      key: `site:image-data-url:${userId}`,
      limit: RATE_LIMIT_PER_HOUR,
      windowMs: 60 * 60 * 1000,
      nowMs: ctx.clock.now().getTime(),
    }),
    'RATE_LIMITED',
  );

  const target = await resolveOwnUrl(ctx, body.url);
  if (target === null) return refuse(ctx, body.url, 'not one of our own URLs');

  let fetched;
  try {
    fetched = await safeFetch(target, {
      maxBytes: MAX_BYTES,
      timeoutMs: TIMEOUT_MS,
      // Only ever our own origin or our own bucket (`resolveOwnUrl`), whose
      // scheme the deployment chose — an `http://` dev origin included. The
      // address rules still apply to every hop.
      allowHttp: true,
      ...options.fetch,
    });
  } catch (error) {
    if (error instanceof SafeFetchError) return refuse(ctx, target, error.message);
    throw error;
  }

  const sniffed = sniffFileType(fetched.bytes, fetched.contentType);
  if (isRejected(sniffed)) return refuse(ctx, target, `not an image: ${sniffed.reason}`);
  if (!ALLOWED_MIME.has(sniffed.mime)) return refuse(ctx, target, `type ${sniffed.mime}`);

  const base64 = Buffer.from(fetched.bytes).toString('base64');
  return { dataUrl: `data:${sniffed.mime};base64,${base64}` };
}

/** One message to the caller, the real reason to the log. */
function refuse(ctx: Ctx, url: string, reason: string): never {
  ctx.logger.warn({ requestId: ctx.requestId, url, reason }, 'site: 拒绝的图片地址');
  throw new DomainError('ATTACHMENT_URL_NOT_ALLOWED');
}

/**
 * The absolute URL to fetch, or `null` when this is not ours to fetch.
 *
 * Three accepted forms, in the order they actually turn up:
 *
 * - `/uploads/…` — a path. Unambiguously ours, and resolved against
 *   `publicOrigin`. A deployment that has not been told its own origin gets
 *   `null` rather than a guess: without it there is no such thing as "ours".
 * - an absolute URL whose host `isTrustedHost` recognises — `publicOrigin` or
 *   one of `extraOrigins`, both from the environment, neither typed into a form
 *   and neither taken from the request's `Host` header. That last point matters
 *   most: with the request's host in the allow-list, the allow-list would be
 *   whatever the caller sent.
 * - an absolute URL under the object storage public base, matched on scheme,
 *   host, port **and path prefix**, because a shared bucket domain is not ours
 *   in general — only our prefix of it is.
 *
 * A protocol-relative `//host/path` is not accepted: it reads as a path and is
 * not one, and no caller in the app produces it.
 */
async function resolveOwnUrl(ctx: Ctx, raw: string): Promise<string | null> {
  const value = raw.trim();
  if (value === '' || value.startsWith('//')) return null;

  if (value.startsWith('/')) {
    const origin = await publicOrigin(ctx);
    if (origin === '') return null;
    try {
      return new URL(value, `${origin}/`).toString();
    } catch {
      return null;
    }
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  // `safeFetch` refuses these too; refusing here keeps the DNS lookup for URLs
  // we were going to fetch anyway.
  if (url.username !== '' || url.password !== '') return null;

  if (await isTrustedHost(ctx, url.host)) return url.toString();
  if (await isUnderStorageBase(ctx, url)) return url.toString();
  return null;
}

/**
 * Is this URL inside the configured object-storage public base?
 *
 * Prefix-matched on the *path*, after normalising the base to end in `/`, so
 * `https://cdn.example.com/shop-a/` does not vouch for
 * `https://cdn.example.com/shop-a-evil/x.png`.
 */
async function isUnderStorageBase(ctx: Ctx, url: URL): Promise<boolean> {
  const settings = await ctx.config.get(storageConfig);
  const raw = settings.s3PublicBaseUrl.trim();
  if (raw === '') return false;

  let base: URL;
  try {
    base = new URL(raw.endsWith('/') ? raw : `${raw}/`);
  } catch {
    return false;
  }
  if (base.protocol !== url.protocol || base.host !== url.host) return false;
  return url.pathname.startsWith(base.pathname);
}
