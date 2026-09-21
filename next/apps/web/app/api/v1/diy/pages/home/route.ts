import { diyHomePage } from '@shop/contracts/diy/storefront.contract';
import * as diy from '@shop/core/diy';
import { handle } from '../../../../../../src/server';

/**
 * The decorated home page. Public, like the legacy `/api/diy/get_diy`: it is
 * the first screen a cold visitor sees, and nothing in it is user-specific.
 */
export const GET = handle(diyHomePage, (ctx) => diy.getHomePage(ctx));

export const dynamic = 'force-dynamic';
