import { diyNavigationRoute } from '@shop/contracts/diy/storefront.contract';
import * as diy from '@shop/core/diy';
import { handle } from '../../../../../src/server';

/**
 * 底部导航, read off the live home page. Mounted on every tabbar page and
 * refetched on each `onShow`, so a caller holding the current version gets a
 * bodyless 304. The validator is the home page's version: the navigation is a
 * component of that page, and every save of it moves the version.
 */
export const GET = handle(diyNavigationRoute, async (ctx) => {
  const navigation = await diy.getNavigation(ctx);
  if (ctx.etag(navigation.version, { weak: true })) ctx.notModified();
  return navigation;
});

export const dynamic = 'force-dynamic';
