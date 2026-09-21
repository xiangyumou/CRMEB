import { diyLinkCategoryList } from '@shop/contracts/diy/diy.contract';
import * as diy from '@shop/core/diy';
import { handle } from '../../../../src/server';

export const GET = handle(diyLinkCategoryList, (ctx) => diy.listLinkCategories(ctx));

export const dynamic = 'force-dynamic';
