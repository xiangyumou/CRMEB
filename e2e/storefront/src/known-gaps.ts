/**
 * Failed requests the storefront is *known* to make, each with the issue that
 * owns it.
 *
 * Journey 1 asserts "no console error, no failed request" on the pages it
 * renders. A known failure that fails journey 1 would say nothing new and
 * would hide the next *unknown* failure behind it; letting everything through
 * would make the assertion worthless. So the list is explicit, each line names
 * its owner, and anything not on it fails the journey. When the owner fixes
 * one, its line here goes.
 */
export const KNOWN_FAILED_REQUESTS: ReadonlyArray<{ pattern: RegExp; owner: string }> = [
  // Empty.
];

/**
 * Console errors and uncaught exceptions the storefront is known to raise
 * today, each with its owner — same rules as `KNOWN_FAILED_REQUESTS`.
 */
export const KNOWN_CONSOLE_ERRORS: ReadonlyArray<{ pattern: RegExp; owner: string }> = [
  // Empty.
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
