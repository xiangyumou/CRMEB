/**
 * Failed requests the storefront is *known* to make today, each with the CR or
 * the CONTRACT-PENDING marker that owns it.
 *
 * Journey 1 asserts "no console error, no failed request" on the pages it
 * renders. Every H5 page load currently makes a couple of requests nothing in
 * the rewrite answers — each filed with the stream that owns the call. Failing journey 1 on those would say nothing new, and
 * would hide the next *unknown* failure behind them; letting everything
 * through would make the assertion worthless. So the list is explicit, each
 * line names its owner, and anything not on it fails the journey.
 *
 * When the owner fixes one, its line here goes — `docs/rewrite/status/i.md`
 * tracks the same list.
 */
export const KNOWN_FAILED_REQUESTS: ReadonlyArray<{ pattern: RegExp; owner: string }> = [
  {
    // `App.vue` fetches the legacy custom-script route on every launch.
    pattern: /^GET \/api\/get_script 404$/,
    owner: 'CR-4-i §4',
  },
  {
    // `${HTTP_REQUEST_URL}/statics/images/…` — the legacy PHP `public/statics`
    // tree (empty-state pictures, the coupon bag, the 开团 gif), which
    // nothing in the rewrite serves.
    pattern: /^GET \/statics\/images\/[\w.-]+ 404$/,
    owner: 'CR-4-i §5',
  },
];

/**
 * Console errors and uncaught exceptions the storefront is known to raise
 * today, each with its owner — same rules as `KNOWN_FAILED_REQUESTS`.
 */
export const KNOWN_CONSOLE_ERRORS: ReadonlyArray<{ pattern: RegExp; owner: string }> = [
  {
    // `App.vue` appends the body of `/api/get_script` as a `<script>`; the
    // route is gone, so the body is an HTML 404 page.
    pattern: /Failed to execute 'appendChild' on 'Node': Unexpected token '<'/,
    owner: 'CR-4-i §4',
  },
  {
    // `pages/index/index.vue` `getCoupon` reads `res.data.list.length`, but
    // `api/api.js` `getCouponV2` maps the list to a bare array.
    pattern:
      /^unhandledrejection TypeError: Cannot read properties of undefined \(reading 'length'\)$/,
    owner: 'CR-4-i §3',
  },
];

/**
 * A rejection carrying an HTTP status is `utils/request.js` passing a failed
 * request on to a caller that did not catch it. The request itself is in
 * `failedRequests` and is judged there, against `KNOWN_FAILED_REQUESTS` — so
 * an unknown failure still fails the journey, once, under its URL.
 */
const HTTP_REJECTION = /^unhandledrejection \{"status":\d{3},/;

/** The entries of `failed` that no `KNOWN_FAILED_REQUESTS` line accounts for. */
export function unexplainedFailures(failed: readonly string[]): string[] {
  return failed.filter((line) => !KNOWN_FAILED_REQUESTS.some((known) => known.pattern.test(line)));
}

/** The entries of `errors` that neither `KNOWN_CONSOLE_ERRORS` nor a failed request accounts for. */
export function unexplainedConsoleErrors(errors: readonly string[]): string[] {
  return errors.filter(
    (line) =>
      !HTTP_REJECTION.test(line) && !KNOWN_CONSOLE_ERRORS.some((known) => known.pattern.test(line)),
  );
}
