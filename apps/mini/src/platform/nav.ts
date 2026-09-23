import { useState } from 'react';
import Taro, { useRouter } from '@tarojs/taro';
import { create } from 'zustand';
import {
  storefrontRoutes,
  type StorefrontRoute,
  type StorefrontRouteKey,
} from '@shop/api-client/routes';

/**
 * Navigation by route key (docs/mini/pages.md §3). Pages, DIY links, messages and shares name a
 * page by `{ route, params }` from the catalogue (`@shop/api-client/routes`), never by path, so
 * a page can move without breaking a link that is already saved or printed.
 *
 * - An unknown key (a link made for a newer client) opens the home page instead of failing.
 * - A tab page cannot take a query (`switchTab` drops it): its params wait in
 *   `pendingTabParams` and the page takes them in `useDidShow` (`useTabParams`).
 * - `navigateTo` past WeChat's 10-page stack fails, so the tenth page replaces the top instead.
 */

type Routes = typeof storefrontRoutes;

/** The param names a key takes, all optional strings: a page checks what it needs. */
export type RouteParamsOf<K extends StorefrontRouteKey> = {
  [P in Routes[K]['params'][number]]?: string;
};

const HOME = storefrontRoutes.home.path;
const MAX_STACK = 10;

function entryOf(key: string) {
  return Object.prototype.hasOwnProperty.call(storefrontRoutes, key)
    ? storefrontRoutes[key as StorefrontRouteKey]
    : null;
}

/** Declared params with a value, in key order (the order `toMiniPath` uses). */
function definedParams(key: StorefrontRouteKey, params: object): Array<[string, string]> {
  const allowed: readonly string[] = storefrontRoutes[key].params;
  return Object.entries(params as Record<string, unknown>)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .filter(([name]) => allowed.includes(name))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * The page path with its query, leading `/`: `/packages/order/detail/index?id=3001`. A tab page
 * never carries a query. An unknown key is the home page. Matches the contracts' `toMiniPath`
 * (plus the slash `navigateTo` wants).
 */
export function toPath(route: StorefrontRoute | { route: string; params?: object }): string {
  const entry = entryOf(route.route);
  if (!entry) return `/${HOME}`;
  if (entry.tab) return `/${entry.path}`;
  const query = definedParams(route.route as StorefrontRouteKey, route.params ?? {})
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return query === '' ? `/${entry.path}` : `/${entry.path}?${query}`;
}

interface PendingTabParams {
  byKey: Partial<Record<StorefrontRouteKey, Record<string, string>>>;
}

/** Params for a tab page, waiting for its next `useDidShow`. */
export const usePendingTabParams = create<PendingTabParams>()(() => ({ byKey: {} }));

/** Takes (and clears) the params waiting for a tab page. */
export function takeTabParams<K extends StorefrontRouteKey>(key: K): RouteParamsOf<K> {
  const params = usePendingTabParams.getState().byKey[key] ?? {};
  usePendingTabParams.setState((state) => {
    const byKey = { ...state.byKey };
    delete byKey[key];
    return { byKey };
  });
  return params as RouteParamsOf<K>;
}

export interface NavigateOptions {
  /** Replace the current page (`redirectTo`) instead of pushing one. */
  replace?: boolean;
}

/** Opens a page by route. Never throws for an unknown key: that opens the home page. */
export async function navigate(
  route: StorefrontRoute | { route: string; params?: object },
  { replace = false }: NavigateOptions = {},
): Promise<void> {
  const entry = entryOf(route.route);
  if (!entry || entry.tab) {
    const key = (entry ? route.route : 'home') as StorefrontRouteKey;
    const params = entry ? Object.fromEntries(definedParams(key, route.params ?? {})) : {};
    usePendingTabParams.setState((state) => ({ byKey: { ...state.byKey, [key]: params } }));
    await Taro.switchTab({ url: `/${storefrontRoutes[key].path}` });
    return;
  }
  const url = toPath(route);
  const depth = typeof Taro.getCurrentPages === 'function' ? Taro.getCurrentPages().length : 0;
  if (replace || depth >= MAX_STACK) await Taro.redirectTo({ url });
  else await Taro.navigateTo({ url });
}

/** Back one page, or home when this is the first page (opened from a share or a code). */
export async function goBack(): Promise<void> {
  const depth = typeof Taro.getCurrentPages === 'function' ? Taro.getCurrentPages().length : 0;
  if (depth > 1) await Taro.navigateBack({ delta: 1 });
  else await navigate({ route: 'home', params: {} });
}

function decodeValue(value: string): string {
  if (!/%[0-9a-f]{2}/i.test(value)) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * The params a page was opened with (`useLoad(options)` / `useRouter().params`), for its key:
 *
 * - opened from a mini-program code: `options.scene` (URI-encoded `k=v&k=v`, or `_` for none;
 *   C11) is decoded;
 * - otherwise the declared params are taken from the query and URI-decoded;
 * - a tab page also takes what `navigate` left for it.
 *
 * Unknown names are dropped. Values are not validated: the page checks what it needs.
 */
export function readRouteParams<K extends StorefrontRouteKey>(
  key: K,
  options: Record<string, string | undefined> | undefined,
): RouteParamsOf<K> {
  const allowed: readonly string[] = storefrontRoutes[key].params;
  const out: Record<string, string> = {};
  const scene = options?.['scene'];
  if (scene !== undefined && scene !== '') {
    const raw = decodeValue(scene);
    if (raw !== '_') {
      for (const pair of raw.split('&')) {
        const at = pair.indexOf('=');
        if (at <= 0) continue;
        const name = pair.slice(0, at);
        if (allowed.includes(name)) out[name] = pair.slice(at + 1);
      }
    }
  } else {
    for (const name of allowed) {
      const value = options?.[name];
      if (typeof value === 'string' && value !== '') out[name] = decodeValue(value);
    }
  }
  if (storefrontRoutes[key].tab) Object.assign(out, takeTabParams(key));
  return out as RouteParamsOf<K>;
}

/**
 * `readRouteParams` for the current page (`useRouter().params`). Tab pages use
 * `useTabPage(key)` instead, which also picks up params left by a later `navigate`.
 */
export function useRouteParams<K extends StorefrontRouteKey>(key: K): RouteParamsOf<K> {
  const { params } = useRouter();
  const [value] = useState(() => readRouteParams(key, params));
  return value;
}

/**
 * The decor editor's draft preview token (F2 opens `packages/page/index?id=&previewToken=`).
 * Deliberately not a catalogue param: a preview link is never shared, saved or linked from DIY.
 * `null` when absent or not token-shaped.
 */
export function usePreviewToken(): string | null {
  const { params } = useRouter();
  const [value] = useState(() => {
    const raw = params.previewToken;
    return typeof raw === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(raw) ? raw : null;
  });
  return value;
}

/**
 * A `login.redirect` value back to a route (pages.md §3.2): JSON of a catalogue route, never a
 * path (no open redirect), never `login` itself. Anything else is `null`.
 */
export function parseLoginRedirect(value: string | undefined): StorefrontRoute | null {
  if (!value) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeValue(value));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { route, params } = parsed as { route?: unknown; params?: unknown };
  if (typeof route !== 'string' || route === 'login' || !entryOf(route)) return null;
  const key = route as StorefrontRouteKey;
  const clean = Object.fromEntries(
    definedParams(key, typeof params === 'object' && params !== null ? params : {}),
  );
  return { route: key, params: clean } as StorefrontRoute;
}

/** The route of a page path (`pages/product/index`), for launch options; `null` if unknown. */
export function routeKeyOfPath(path: string): StorefrontRouteKey | null {
  const clean = path.replace(/^\//, '').split('?')[0] ?? '';
  for (const [key, entry] of Object.entries(storefrontRoutes)) {
    if (entry.path === clean) return key as StorefrontRouteKey;
  }
  return null;
}
