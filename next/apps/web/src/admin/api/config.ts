/** Where the admin UI sends its requests and how it reacts to a lost session. */
export interface ApiConfig {
  /** Prefixed in front of `route.path`. Empty means "same origin", which is the norm. */
  baseUrl: string;
  /** Injectable for tests and for the kit demo's in-memory mock. */
  fetch: typeof fetch;
  /**
   * Called when a request comes back 401 and the caller did not opt out.
   * Default: full page navigation to `/admin/login?next=<current url>`.
   */
  onUnauthenticated: () => void;
  /**
   * Validate 2xx bodies against `route.response`. On in development so drift
   * between a contract and its handler surfaces immediately; off in production
   * because it is pure cost on a shape the server already validated.
   */
  validateResponses: boolean;
}

function defaultOnUnauthenticated(): void {
  if (typeof window === 'undefined') return;
  const { pathname, search, hash } = window.location;
  if (pathname.startsWith('/admin/login')) return;
  const next = `${pathname}${search}${hash}`;
  // A hard navigation on purpose: the session is gone, so every cached query,
  // provider and in-flight request should go with it.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/admin/login?next=${encodeURIComponent(next)}`);
}

const config: ApiConfig = {
  baseUrl: '',
  fetch: (...args) => globalThis.fetch(...args),
  onUnauthenticated: defaultOnUnauthenticated,
  validateResponses: process.env.NODE_ENV === 'development',
};

export function getApiConfig(): Readonly<ApiConfig> {
  return config;
}

/**
 * Overrides parts of the client configuration. Used by tests, by the kit demo
 * page (to point `fetch` at an in-memory router) and, if it ever becomes
 * necessary, by a deployment that serves the API from another origin.
 */
export function configureApi(patch: Partial<ApiConfig>): void {
  Object.assign(config, patch);
}

/** Restores the shipping defaults. Test helper. */
export function resetApiConfig(): void {
  config.baseUrl = '';
  config.fetch = (...args) => globalThis.fetch(...args);
  config.onUnauthenticated = defaultOnUnauthenticated;
  config.validateResponses = process.env.NODE_ENV === 'development';
}
