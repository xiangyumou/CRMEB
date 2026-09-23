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
  await Taro.navigateTo({ url: url.startsWith('/') ? url : `/${url}` });
  return true;
}
