import type { RequestMeta } from '@shop/core/user';

/**
 * What the sign-in services want to know about the caller, read off the request.
 *
 * `x-forwarded-for` is a list the proxies append to, so the **first** entry is
 * the client and everything after it is infrastructure. Reading the last one —
 * or `request.headers.get('x-real-ip')` behind two proxies — buckets the whole
 * shop into one throttle counter, which is the bug this helper exists to avoid.
 * It is trusted only because nothing but the reverse proxy can reach the app;
 * the throttle keys always pair it with the account, never the address alone.
 */
export function requestMeta(request: Request): RequestMeta {
  return { ip: clientIp(request), userAgent: request.headers.get('user-agent') };
}

export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  if (first) return first;
  return request.headers.get('x-real-ip');
}

/** The opaque storefront token, for the one route that revokes it by value. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}
