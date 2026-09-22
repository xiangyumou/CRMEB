/**
 * Claims by a registered config group that the runner **ignores**, each with
 * the CR that will remove the need for this file.
 *
 * A config group's `legacyKeys` belongs to the domain that owns the group. When
 * the migration proves a claim wrong, the fix belongs there and needs a
 * decision — which unit is right, which key the field really means — so the
 * claim is parked here in the meantime: the wrong value does not migrate while
 * the CR is open, and the entry is a to-do list rather than a comment nobody
 * reads.
 *
 * An entry removed from here without the owning stream fixing its `legacyKeys`
 * turns the key back on. `config.test.ts` asserts every entry still matches a
 * live claim, so an entry whose CR has landed fails the test instead of sitting
 * here forever.
 */

export interface ConfigClaimOverride {
  legacyKey: string;
  group: string;
  /** The field of that group which claims it. */
  key: string;
  cr: string;
  reason: string;
}

/**
 * Empty, and that is the intended state.
 *
 * The one entry this file ever held was `order_activity_time` claimed by
 * `order-fulfil.reviewWindowDays` — wrong setting, wrong unit. CR-2-j was
 * accepted and the claim now points at `system_comment_time`, so the parking
 * space is no longer needed and the key is a plain drop-list entry.
 *
 * The mechanism stays. A wrong claim will turn up again — it is the kind of
 * mistake that only shows itself when a real dump meets a real schema — and
 * finding one mid-cutover with nowhere to park it is worse than an empty array.
 */
export const IGNORED_CONFIG_CLAIMS: readonly ConfigClaimOverride[] = [];

const IGNORED = new Set(
  IGNORED_CONFIG_CLAIMS.map((entry) => `${entry.legacyKey}|${entry.group}|${entry.key}`),
);

export function isIgnoredClaim(legacyKey: string, group: string, key: string): boolean {
  return IGNORED.has(`${legacyKey}|${group}|${key}`);
}
