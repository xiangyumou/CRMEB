'use client';

import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import { Alert, Card, Col, Row, Skeleton, Space, Typography } from 'antd';
import Link from 'next/link';
import { statsOrders, statsTrade } from '@shop/contracts/stats/stats.admin.contract';
import type { DashboardTile } from '@shop/contracts/system/schemas';
import { systemDashboardHeader } from '@shop/contracts/system/system.settings.contract';

import { useRouteQuery } from '@/admin/api/hooks';
import { PageContainer } from '@/admin/kit/page-container';
import { useMemoryUrlState } from '@/admin/kit/table/url-state';
import { useCan, useSession } from '@/admin/session/session-provider';
import {
  formatFigure,
  ProductRankingTable,
  StatsChart,
  StatsRangePicker,
  useStatsRange,
} from '@/admin/stats';

/**
 * 工作台.
 *
 * The tiles are **not** computed here. They come from
 * `GET /admin-api/dashboard/header`, which asks every registered
 * `DashboardContributor` — `system`, `storage` and `stats` — in
 * parallel and permission-filtered. That is why a tile can be *missing* rather
 * than zero: an admin who may not open 交易统计 does not learn today's revenue
 * from the home page instead, and a contributor that throws lands in
 * `degraded` instead of taking the page down.
 *
 * Everything below the tiles is the ordinary statistics surface, with a window
 * held in memory rather than in the URL: the home page is where an operator
 * lands, and it should not accumulate a query string.
 */
export function DashboardPage() {
  const { identity } = useSession();
  const can = useCan();
  const urlState = useMemoryUrlState();
  const range = useStatsRange(urlState);

  const header = useRouteQuery(systemDashboardHeader, undefined, {
    enabled: can('system:dashboard:read'),
  });
  const trade = useRouteQuery(
    statsTrade,
    { query: range.query },
    { enabled: can('stats:trade:read') },
  );
  const orders = useRouteQuery(
    statsOrders,
    { query: range.query },
    { enabled: can('stats:order:read') },
  );

  return (
    <PageContainer
      title={`你好，${identity.name}`}
      subTitle="今日概览与经营趋势"
      extra={<StatsRangePicker range={range} />}
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {header.data?.degraded.length ? (
          <Alert
            type="warning"
            showIcon
            message="部分指标暂时不可用"
            description={`以下来源未能返回数据：${header.data.degraded.join('、')}。其余指标正常。`}
          />
        ) : null}

        <HeaderTiles tiles={header.data?.tiles} loading={header.isPending} />

        <Row gutter={[16, 16]}>
          {can('stats:trade:read') ? (
            <Col xs={24} xl={12}>
              <StatsChart chart={trade.data?.chart} loading={trade.isPending} title="交易趋势" />
            </Col>
          ) : null}
          {can('stats:order:read') ? (
            <Col xs={24} xl={12}>
              <StatsChart chart={orders.data?.chart} loading={orders.isPending} title="订单趋势" />
            </Col>
          ) : null}
        </Row>

        {can('stats:product:read') ? (
          <ProductRankingTable
            query={range.query}
            defaultLimit={10}
            controls={false}
            title="商品排行（前 10）"
            extra={<Link href="/admin/stats/products">查看全部</Link>}
          />
        ) : null}
      </Space>
    </PageContainer>
  );
}

function HeaderTiles({ tiles, loading }: { tiles: DashboardTile[] | undefined; loading: boolean }) {
  if (loading && !tiles) {
    return (
      <Row gutter={[16, 16]}>
        {Array.from({ length: 4 }, (_, index) => (
          <Col key={index} xs={12} md={6}>
            <Card size="small">
              <Skeleton active paragraph={{ rows: 1 }} title={false} />
            </Card>
          </Col>
        ))}
      </Row>
    );
  }
  if (!tiles?.length) return null;

  return (
    <Row gutter={[16, 16]}>
      {tiles.map((tile) => (
        <Col key={tile.key} xs={12} md={6}>
          <Card size="small" hoverable={Boolean(tile.href)}>
            <TileBody tile={tile} />
          </Card>
        </Col>
      ))}
    </Row>
  );
}

function TileBody({ tile }: { tile: DashboardTile }) {
  const body = (
    <>
      <Typography.Text type="secondary">{tile.label}</Typography.Text>
      <div style={{ fontSize: 24, lineHeight: '32px', fontVariantNumeric: 'tabular-nums' }}>
        {tile.format === 'bytes' ? formatBytes(tile.value) : formatFigure(tile.value, tile.format)}
      </div>
      <TileDelta tile={tile} />
    </>
  );
  return tile.href ? (
    <Link href={tile.href} style={{ color: 'inherit' }}>
      {body}
    </Link>
  ) : (
    body
  );
}

function TileDelta({ tile }: { tile: DashboardTile }) {
  if (tile.deltaFromYesterday === null) {
    return (
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        —
      </Typography.Text>
    );
  }
  const up = tile.deltaFromYesterday >= 0;
  const shown =
    tile.format === 'bytes'
      ? formatBytes(Math.abs(tile.deltaFromYesterday))
      : formatFigure(Math.abs(tile.deltaFromYesterday), tile.format);
  return (
    <Typography.Text type={up ? 'success' : 'danger'} style={{ fontSize: 12 }}>
      较昨日 {up ? <ArrowUpOutlined /> : <ArrowDownOutlined />} {shown}
    </Typography.Text>
  );
}

function formatBytes(value: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
