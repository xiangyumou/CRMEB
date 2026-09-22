import { statsProductExport } from '@shop/contracts/stats/stats.admin.contract';
import * as stats from '@shop/core/stats';
import { handle } from '../../../../../src/server';

/**
 * `/admin-api/stats/products/exports` — 商品统计导出.
 *
 * CSV inside a JSON envelope (CR-2-b2); the page turns `content` into a
 * download. Its own permission atom: reading the page and walking out with the
 * window as a file are different acts.
 */
export const GET = handle(statsProductExport, (ctx, { query }) => stats.productExport(ctx, query));

export const dynamic = 'force-dynamic';
