import { diyPageVersion } from '@shop/contracts/diy/storefront.contract';
import * as diy from '@shop/core/diy';
import { handle } from '../../../../../src/server';

/**
 * The cheap poll the app makes on resume. Legacy `get_diy_version`: the page
 * payload is large and changes rarely, so the client compares this string
 * before downloading it again.
 */
export const GET = handle(diyPageVersion, (ctx, { query }) => diy.getPageVersion(ctx, query));

export const dynamic = 'force-dynamic';
