import type { OrderEntryCounts, PersonalSlot, UserSummary } from '@shop/contracts/decor/sources';

/** A block's per-shopper state, by slot, as `ResolvedPage.personal[blockId]` carries it. */
export type PersonalSlots = Readonly<Record<string, PersonalSlot>>;

export function userSummaryIn(
  personal: PersonalSlots | undefined,
  slot = 'user',
): UserSummary | null {
  const value = personal?.[slot];
  return value?.kind === 'userSummary' ? value.user : null;
}

export function orderCountsIn(
  personal: PersonalSlots | undefined,
  slot = 'counts',
): OrderEntryCounts | null {
  const value = personal?.[slot];
  return value?.kind === 'orderCounts' ? value.counts : null;
}

/** A badge's text: nothing for 0, `99+` past 99. */
export function badgeText(count: number | undefined): string | null {
  if (count === undefined || count <= 0) return null;
  return count > 99 ? '99+' : String(count);
}
