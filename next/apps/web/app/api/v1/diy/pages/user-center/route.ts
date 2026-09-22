import { diyUserCenterPage } from '@shop/contracts/diy/storefront.contract';
import * as diy from '@shop/core/diy';
import { handle } from '../../../../../../src/server';

/**
 * 个人中心 (CR-3-h2 §1). A fixed segment, so Next resolves it before the
 * sibling `[id]` route and `user-center` never reaches the numeric param.
 */
export const GET = handle(diyUserCenterPage, (ctx) => diy.getUserCenterPage(ctx));

export const dynamic = 'force-dynamic';
