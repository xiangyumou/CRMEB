import type { VisitBody } from '@shop/contracts/user/schemas';
import type { ClientPlatform } from '@shop/contracts/conventions';
import type { Ctx } from '../kernel/context';
import { fixedWindow } from '../kernel/rate-limit';
import type { RequestMeta } from './storefront-auth.service';
import * as repo from './user.visit.repo';

/**
 * `POST /api/v1/visits` — the storefront page-view beacon (CR-1-f3 §1).
 *
 * Legacy had a `setVisit` call on the client and no endpoint behind it, so
 * `user_visits` has been empty for as long as the table has existed and 访客数
 * has read 0 on every live shop. One insert fixes every figure that reads it,
 * with no change in `stats`.
 *
 * **Nothing here can throw.** A beacon is fired while the visitor is doing
 * something else; a refusal it could see would either be swallowed (making the
 * check pointless) or retried (making the flood worse). So the throttle drops
 * the row and returns, and the route answers 204 either way. The one thing the
 * caller *can* get wrong — a path with a query string in it — is caught by the
 * contract before this runs, because that one is a privacy bug rather than a
 * volume one.
 */

/**
 * One row per visitor, per path, per minute.
 *
 * The number is set by the mini program's `onShow`, which fires every time the
 * visitor comes back from a sub-page: browsing a category and tapping four
 * products would otherwise record five views of the category page in under a
 * minute. A minute is long enough to collapse that and short enough that a
 * visitor genuinely returning to a page through the day is still counted.
 *
 * 访客数 is a distinct count and is unaffected by the throttle; 浏览量 is the
 * figure this protects.
 */
const WINDOW_MS = 60_000;
const PER_WINDOW = 1;

/** `wechat-mini` on the wire, `wechat_mini` in the enum — the same three values. */
function toColumnPlatform(
  platform: ClientPlatform | null,
): 'h5' | 'wechat_oa' | 'wechat_mini' | null {
  if (platform === null) return null;
  return platform === 'wechat-oa' ? 'wechat_oa' : platform === 'wechat-mini' ? 'wechat_mini' : 'h5';
}

/**
 * Who this beacon is throttled against.
 *
 * A signed-in visitor is their user id. Everybody else is their address —
 * `user_visits` has no session column and this stream may not add one (see
 * `docs/rewrite/status/e4.md`), so the identity used for counting is the same
 * one `stats` already uses for 访客数: `coalesce(user_id, 'ip:' || ip)`. That
 * keeps the throttle and the figure talking about the same visitor instead of
 * two different notions of one.
 *
 * Behind a shared NAT this is coarser than a session id would be: a shopping
 * centre's wifi is one visitor for both the throttle and the figure. That is
 * the pre-existing definition of 访客数, not something the beacon introduces,
 * and a client-supplied session id would be worse — it is the one value a
 * caller can mint at will, so it would turn the throttle off for anybody who
 * bothered to randomise it.
 */
function subjectOf(ctx: Ctx, meta: RequestMeta): string {
  const userId = ctx.actor.kind === 'user' || ctx.actor.kind === 'staff' ? ctx.actor.id : null;
  if (userId !== null) return `u:${userId}`;
  return `ip:${meta.ip ?? 'unknown'}`;
}

export async function recordVisit(ctx: Ctx, body: VisitBody, meta: RequestMeta): Promise<void> {
  const subject = subjectOf(ctx, meta);
  const now = ctx.clock.now();
  const allowed = await fixedWindow(ctx.redis, {
    key: `visit:${subject}:${body.path}`,
    limit: PER_WINDOW,
    windowMs: WINDOW_MS,
    nowMs: now.getTime(),
  });
  if (!allowed.allowed) return;

  const userId = ctx.actor.kind === 'user' || ctx.actor.kind === 'staff' ? ctx.actor.id : null;
  await repo.insertVisit(ctx.db, {
    userId,
    path: body.path,
    // The body may say which storefront this is; `X-Client-Platform` is the
    // usual source and the fallback. Neither is trusted for anything but a
    // breakdown chart.
    platform: toColumnPlatform(body.platform ?? ctx.platform),
    ip: meta.ip ?? null,
    now,
  });
}
