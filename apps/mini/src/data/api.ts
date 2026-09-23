import { createApiClient } from '@shop/api-client';
import { platform } from '@/platform';

/** Sent as `X-Client-Version`. TODO(stream A): the release version from the build. */
export const CLIENT_VERSION = '0.0.0';

interface AuthHooks {
  getToken: () => string | null;
  onUnauthorized: () => void;
}

let auth: AuthHooks = { getToken: () => null, onUnauthorized: () => undefined };

/**
 * The session module (`features/session`) plugs its token and its 401 handling in here, so the
 * client and the session do not import each other.
 */
export function installAuth(hooks: AuthHooks): void {
  auth = hooks;
}

/**
 * The one `/api/v1` client. Its transport, origin and `X-Client-Platform` come from the build's
 * platform implementation: `Taro.request` to the shop's origin as `wechat-mini` in the
 * mini-program, same-origin `fetch` on H5 (as `wechat-mini` in the e2e emulation build).
 */
export const api = createApiClient({
  baseUrl: platform.api.baseUrl,
  transport: platform.api.transport,
  platform: platform.api.clientPlatform,
  clientVersion: CLIENT_VERSION,
  getToken: () => auth.getToken(),
  onUnauthorized: () => auth.onUnauthorized(),
});
