import type { StorefrontRoute, StorefrontRouteKey } from '@shop/api-client/routes';
import { routeKeyOfPath } from '@/platform';

/**
 * 开屏浮层 (pages.md §2.1, 首页): `app/config.splashAd`, at most once a day.
 *
 * `splashAd.link` is still the legacy path string an operator typed for the uni-app
 * (`/pages/goods_details/index?id=12`), not a `LinkTarget` (a backend gap, stream B status). It is
 * read here, defensively: a catalogue page path, the two legacy paths operators actually used,
 * or an https URL. Anything else makes the picture not tappable.
 */

/** Storage key of the shop day the overlay last showed. */
export const SPLASH_DAY_KEY = 'shop.splash.day';

const SHOP_OFFSET_MS = 8 * 60 * 60 * 1000;

/** `2026-09-24`: the day in China (UTC+8), whatever the phone's zone. */
export function shopDay(nowMs: number): string {
  return new Date(nowMs + SHOP_OFFSET_MS).toISOString().slice(0, 10);
}

export interface SplashAd {
  enabled: boolean;
  imageUrl: string | null;
  link: string | null;
  seconds: number;
}

/** Whether the overlay should show now: switched on, has a picture, not yet shown today. */
export function splashDue(ad: SplashAd | null | undefined, lastDay: string | null, today: string) {
  return Boolean(ad?.enabled && ad.imageUrl && lastDay !== today);
}

export type SplashAction =
  { kind: 'route'; route: StorefrontRoute } | { kind: 'external'; url: string } | null;

/** Legacy uni-app pages and the catalogue key + param names they meant. */
const LEGACY: Record<string, { key: StorefrontRouteKey; params: Record<string, string> }> = {
  'pages/goods_details/index': { key: 'product', params: { id: 'id' } },
  'pages/goods/goods_list/index': { key: 'productList', params: { cid: 'categoryId' } },
};

function queryOf(search: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of search.split('&')) {
    const at = pair.indexOf('=');
    if (at <= 0) continue;
    try {
      out[decodeURIComponent(pair.slice(0, at))] = decodeURIComponent(pair.slice(at + 1));
    } catch {
      // A malformed escape: skip the pair.
    }
  }
  return out;
}

export function splashAction(link: string | null): SplashAction {
  const value = link?.trim() ?? '';
  if (value === '') return null;
  if (/^https:\/\//i.test(value)) return { kind: 'external', url: value };
  const [rawPath = '', search = ''] = value.split('?');
  const path = rawPath.replace(/^\//, '');
  const query = queryOf(search);
  const legacy = LEGACY[path];
  if (legacy) {
    const params: Record<string, string> = {};
    for (const [from, to] of Object.entries(legacy.params)) {
      if (query[from]) params[to] = query[from];
    }
    if (legacy.key === 'product' && !params['id']) return null;
    return { kind: 'route', route: { route: legacy.key, params } as StorefrontRoute };
  }
  const key = routeKeyOfPath(path);
  if (!key) return null;
  return { kind: 'route', route: { route: key, params: query } as StorefrontRoute };
}
