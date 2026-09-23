import type { Ctx } from '../kernel/context';

/**
 * The Redis keys behind the cached public 装修 reads, and the one function that
 * drops them (CR-3-h2).
 *
 * **A module of its own, deliberately.** The reads live in
 * `diy-storefront.service.ts`, which imports `toStorefront` from
 * `diy-page.service.ts`; the writes live in `diy-page.service.ts` and have to
 * invalidate. Putting the invalidation beside the reads would close
 * `diy-page.service → diy-storefront.service → diy-page.service`, and this
 * codebase has already paid for one import cycle: `system → payment →
 * notification → system` left `notification.effects.ts` registering its handler
 * as `undefined/undefined` because it read constants from a half-initialised
 * module, and every notification in the shop retried for ever. Two consts and a
 * `DEL` in a leaf module is the cheap way not to find out again.
 */

const CACHE_SECONDS = 60;

export const DIY_CACHE = {
  seconds: CACHE_SECONDS,
  userCenter: 'diy:user-center:v1',
  navigation: 'diy:navigation:v1',
  productDetail: 'diy:product-detail:v1',
} as const;

const KEYS = [DIY_CACHE.userCenter, DIY_CACHE.navigation, DIY_CACHE.productDetail] as const;

/**
 * Drops every cached storefront read.
 *
 * Called from each 装修 write that can change one — saving content, publishing,
 * switching the home page, restoring the factory copy, deleting. All the keys
 * go together rather than one per mutation: they are a few values off a few pages,
 * an extra `DEL` costs nothing, and a per-mutation map is a thing to get wrong
 * later.
 *
 * Never throws. A stale entry lives at most 60 s; failing an operator's publish
 * because Redis hiccuped would be the worse trade.
 */
export async function invalidateDiyStorefrontCache(ctx: Ctx): Promise<void> {
  try {
    await ctx.redis.del(...KEYS);
  } catch (error) {
    ctx.logger.warn({ err: error }, 'diy: storefront cache invalidation failed');
  }
}
