import { diyThemeList } from '@shop/contracts/diy/diy.contract';
import * as diy from '@shop/core/diy';
import { handle } from '../../../../src/server';

export const GET = handle(diyThemeList, (ctx) => diy.listThemes(ctx));

export const dynamic = 'force-dynamic';
