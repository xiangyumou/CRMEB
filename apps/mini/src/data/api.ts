import { createApiClient } from '@shop/api-client';
import { platform } from '@/platform';
import { renewingTransport } from '@/session/renewing-transport';

/** Sent as `X-Client-Version`. TODO(I1): the release version from the build. */
export const CLIENT_VERSION = '0.0.0';

interface AuthHooks {
  getToken: () => string | null;
  /** Sign in again after a 401; the new token or `null`. */
  renew: () => Promise<string | null>;
  onUnauthorized: () => void;
}

let auth: AuthHooks = {
  getToken: () => null,
  renew: () => Promise.resolve(null),
  onUnauthorized: () => undefined,
};

/**
 * The session module (`src/session`) plugs its token, its renewal and its 401 handling in
 * here, so the client and the session do not import each other.
 */
export function installAuth(hooks: AuthHooks): void {
  auth = hooks;
}

/** The session's hooks, for requests that do not go through the client (`uploadImage`). */
export function authHooks(): Readonly<AuthHooks> {
  return auth;
}

/**
 * The one `/api/v1` client. Its transport, origin and `X-Client-Platform` come from the build's
 * platform implementation: `Taro.request` to the shop's origin as `wechat-mini` in the
 * mini-program, same-origin `fetch` on H5 (as `wechat-mini` in the e2e emulation build). The
 * transport renews an expired session and replays the request once (session/renewing-transport).
 */
export const api = createApiClient({
  baseUrl: platform.api.baseUrl,
  transport: renewingTransport(platform.api.transport, {
    currentToken: () => auth.getToken(),
    renew: () => auth.renew(),
  }),
  platform: platform.api.clientPlatform,
  clientVersion: CLIENT_VERSION,
  getToken: () => auth.getToken(),
  onUnauthorized: () => auth.onUnauthorized(),
});
