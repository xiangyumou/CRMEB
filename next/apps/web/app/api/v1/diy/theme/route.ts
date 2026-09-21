import { diyTheme } from '@shop/contracts/diy/storefront.contract';
import * as diy from '@shop/core/diy';
import { handle } from '../../../../../src/server';

export const GET = handle(diyTheme, (ctx) => diy.getActiveTheme(ctx));

export const dynamic = 'force-dynamic';
