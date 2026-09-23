import { createHash } from 'node:crypto';

// Shared by the three `/api/v1/pages` routes.

/**
 * `X-Client-Version` (semver), which `handle()` does not parse into the
 * context. The page resolver leaves out block types newer than the client;
 * a missing or garbled header means "serve every block".
 */
export function clientVersionOf(request: Request): string | null {
  const raw = request.headers.get('x-client-version')?.trim();
  return raw && /^\d+\.\d+\.\d+$/.test(raw) ? raw : null;
}

/**
 * The page's entity tag: a hash of everything but `resolvedAt`, so an
 * unchanged page — same layout, same data, same personal state — answers 304
 * even though it was re-resolved.
 */
export function pageEtag(page: { resolvedAt: string }): string {
  const { resolvedAt: _resolvedAt, ...rest } = page;
  return createHash('sha256').update(JSON.stringify(rest)).digest('base64url').slice(0, 27);
}
