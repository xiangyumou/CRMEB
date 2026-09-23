import type { StorefrontRoute } from '@shop/api-client/routes';
import { parseLoginRedirect } from '@/platform';

/**
 * Where a message leads (pages.md §4): `data.route` is a `{ route, params }` from the route
 * catalogue (H2, NOTIF-006). Anything else — no route, a key this client does not know, a
 * malformed value — is `null`, and the message opens its own detail page instead.
 *
 * The check is the login redirect's (a catalogue route, declared params only, never `login`).
 */
export function messageRoute(
  data: Readonly<Record<string, unknown>> | null,
): StorefrontRoute | null {
  const route = data?.['route'];
  if (typeof route !== 'object' || route === null) return null;
  return parseLoginRedirect(JSON.stringify(route));
}
