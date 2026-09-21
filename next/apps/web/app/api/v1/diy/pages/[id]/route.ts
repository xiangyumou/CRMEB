import { diyPage } from '@shop/contracts/diy/storefront.contract';
import * as diy from '@shop/core/diy';
import { handle } from '../../../../../../src/server';

export const GET = handle(diyPage, (ctx, { params }) => diy.getStorefrontPage(ctx, params));

export const dynamic = 'force-dynamic';
