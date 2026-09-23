import { diyLayoutRoute } from '@shop/contracts/diy/storefront.contract';
import * as diy from '@shop/core/diy';
import { handle } from '../../../../../../src/server';

/** 分类页 / 个人中心 版式. */
export const GET = handle(diyLayoutRoute, (ctx, { params }) => diy.getLayout(ctx, params));

export const dynamic = 'force-dynamic';
