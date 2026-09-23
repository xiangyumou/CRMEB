import Taro from '@tarojs/taro';
import { isRemovedStorefrontPage } from '@shop/contracts/diy/removed';

/**
 * Opens a storefront page. A link to a page this build no longer ships (saved in an old DIY
 * design, say) is dropped rather than navigated into a "page not found".
 *
 * `isRemovedStorefrontPage` is a plain TS module in `@shop/contracts` with no zod import, which
 * is what lets the mini-program use it at runtime (see docs/mini/spikes/S1-taro.md).
 */
export async function openPage(url: string): Promise<boolean> {
  if (isRemovedStorefrontPage(url)) return false;
  await Taro.navigateTo({ url: withSlash(url) });
  return true;
}

/**
 * Replaces the current page. The checkout, the cashier and the payment result replace each
 * other, so 返回 from a result never lands on a cashier for an order that is already paid (C06).
 *
 * TODO(stream A): both take a `StorefrontRoute` once the route catalogue exists (pages.md §3).
 */
export async function replacePage(url: string): Promise<void> {
  await Taro.redirectTo({ url: withSlash(url) });
}

/** A short message over the page (`wx.showToast`, no icon). */
export function toast(title: string): void {
  void Taro.showToast({ title, icon: 'none' }).catch(() => undefined);
}

function withSlash(url: string): string {
  return url.startsWith('/') ? url : `/${url}`;
}
