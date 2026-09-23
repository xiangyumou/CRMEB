import { useRouteQuery } from '@shop/api-client/react';

export interface ProductActivity {
  kind: 'groupbuy' | 'presale';
  activityId: string;
  price: string;
  /** 「2 人团」, 「付款后 7 天内发货」. */
  note: string;
}

const LONG = { staleTime: 5 * 60_000 } as const;

/**
 * The 拼团 / 预售 activities a product is in, for the entry bars on 商品详情.
 *
 * Neither list takes a `productId` filter and the product detail does not name its activities
 * (a backend gap, stream B status), so both lists are read (one page of 100, cached for five
 * minutes, shared by every product page) and filtered here.
 */
export function useProductActivities(productId: string): ProductActivity[] {
  const groupbuys = useRouteQuery('groupbuy.list', { query: { pageSize: 100 } }, LONG);
  const presales = useRouteQuery('presale.list', { query: { pageSize: 100 } }, LONG);
  const out: ProductActivity[] = [];
  for (const card of groupbuys.data?.items ?? []) {
    if (card.productId !== productId || !card.canBuy) continue;
    out.push({
      kind: 'groupbuy',
      activityId: card.activityId,
      price: card.price,
      note: `${card.seatsRequired} 人团`,
    });
  }
  for (const card of presales.data?.items ?? []) {
    if (card.productId !== productId || !card.canBuy) continue;
    out.push({
      kind: 'presale',
      activityId: card.activityId,
      price: card.price,
      note: card.shipAfterDays > 0 ? `付款后 ${card.shipAfterDays} 天内发货` : '付款后尽快发货',
    });
  }
  return out;
}
