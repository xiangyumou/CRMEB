'use client';

import { Alert } from 'antd';
import { statsProductExport, statsProducts } from '@shop/contracts/stats/stats.admin.contract';

import { useRouteQuery } from '@/admin/api/hooks';
import {
  ProductRankingTable,
  StatsExportButton,
  StatsPageFrame,
  useStatsRange,
} from '@/admin/stats';

/**
 * 商品统计 — the funnel (浏览 → 加购 → 下单 → 支付) and the ranking.
 *
 * 加购件数 reads 0 until something writes a `cart` product event; CR-1-f3 asks
 * for it. The note below says so rather than letting an operator read a real
 * zero — `cart_items` is not a substitute, because the row is deleted when the
 * order is placed.
 */
export function ProductStatsPage() {
  const range = useStatsRange();
  const { data, isPending } = useRouteQuery(statsProducts, { query: range.query });

  const cartIsUnfed =
    data?.metrics.find((metric) => metric.key === 'cartQuantity')?.value === 0 &&
    data.metrics.find((metric) => metric.key === 'cartQuantity')?.previous === 0;

  return (
    <StatsPageFrame
      subTitle="浏览与收藏来自商品行为事件，下单与支付来自订单明细"
      range={range}
      data={data}
      loading={isPending}
      metricColumns={4}
      chartTitle="商品趋势"
      actions={
        <StatsExportButton
          route={statsProductExport}
          query={range.query}
          permission="stats:product:export"
          label="导出商品统计"
        />
      }
    >
      {cartIsUnfed ? (
        <Alert
          type="info"
          showIcon
          message="加购件数暂无来源"
          description="加入购物车尚未记录为商品行为事件（CR-1-f3），该列会一直显示 0。其余指标不受影响。"
        />
      ) : null}
      <ProductRankingTable query={range.query} />
    </StatsPageFrame>
  );
}
