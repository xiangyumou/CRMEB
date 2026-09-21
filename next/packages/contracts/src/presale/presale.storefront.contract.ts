import { z } from 'zod';
import { id } from '../_conventions/common';
import { defineRoute } from '../_conventions/route';
import {
  pagedPresaleCards,
  presaleCardExample,
  presaleDetail,
  presaleDetailExample,
  presaleListQuery,
} from './schemas';

/**
 * Storefront presale routes, under `/api/v1/presale/`.
 *
 * Two reads and nothing else. Buying a presale item is placing an order, so it
 * goes through B1's `POST /api/v1/orders` with `kind: 'presale'` and
 * `kindMeta: { activityId }`; the `OrderKindHandler` reserves the presale
 * stock, writes the `presale_orders` row and the `presale_stock_ledger`
 * reservation inside B1's transaction.
 */

const activityParams = z.object({ id });

export const presaleList = defineRoute({
  id: 'presale.list',
  method: 'GET',
  path: '/api/v1/presale/activities',
  auth: 'public',
  summary: '预售活动列表',
  tags: ['presale'],
  query: presaleListQuery,
  response: pagedPresaleCards,
  examples: [
    {
      name: 'first-page',
      query: { page: 1, pageSize: 20 },
      response: { items: [presaleCardExample], total: 1, page: 1, pageSize: 20 },
    },
  ],
});

export const presaleDetailRoute = defineRoute({
  id: 'presale.detail',
  method: 'GET',
  path: '/api/v1/presale/activities/:id',
  auth: 'public',
  summary: '预售活动详情',
  tags: ['presale'],
  params: activityParams,
  response: presaleDetail,
  errors: ['PRESALE_ACTIVITY_NOT_FOUND'],
  examples: [
    { name: 'ok', params: { id: '2' }, response: presaleDetailExample },
    {
      name: 'sold-out',
      params: { id: '2' },
      response: {
        ...presaleDetailExample,
        stock: 0,
        canBuy: false,
        skus: [{ ...presaleDetailExample.skus[0]!, stock: 0 }],
      },
    },
  ],
});
