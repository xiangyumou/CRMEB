import { diyNavigationRoute } from '@shop/contracts/diy/storefront.contract';
import * as diy from '@shop/core/diy';
import { handle } from '../../../../../src/server';

/** 底部导航, off the live home page. */
export const GET = handle(diyNavigationRoute, (ctx) => diy.getNavigation(ctx));

export const dynamic = 'force-dynamic';
