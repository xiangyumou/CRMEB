/**
 * Claims by a registered config group that the runner **ignores**, each with
 * the CR that will remove the need for this file.
 *
 * A config group's `legacyKeys` belongs to the stream that owns the group, and
 * stream J does not edit another stream's files. When the migration proves a
 * claim wrong, the CR goes to the owner and the claim is parked here in the
 * meantime — so the wrong value does not migrate while the CR is decided, and
 * the entry is a to-do list rather than a comment nobody reads.
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

export const IGNORED_CONFIG_CLAIMS: readonly ConfigClaimOverride[] = [
  {
    legacyKey: 'order_activity_time',
    group: 'order-fulfil',
    key: 'reviewWindowDays',
    cr: 'CR-2-j',
    reason:
      '旧键 order_activity_time 是「活动未支付订单取消时间（小时）」，不是评价期。' +
      '评价期对应的旧键是 system_comment_time（天）。' +
      '照搬会把「1 小时」经小时→分钟换算成「60 天评价期」——量纲和语义都不对。' +
      '活动订单的超时取消随秒杀/砍价一起下线，拼团与预售各自带自己的计时，所以该旧键无继承者，' +
      '在 config-dropped.ts 里显式丢弃。',
  },
];

const IGNORED = new Set(
  IGNORED_CONFIG_CLAIMS.map((entry) => `${entry.legacyKey}|${entry.group}|${entry.key}`),
);

export function isIgnoredClaim(legacyKey: string, group: string, key: string): boolean {
  return IGNORED.has(`${legacyKey}|${group}|${key}`);
}
