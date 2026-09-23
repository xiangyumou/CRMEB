'use client';

import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import { Card, Col, Row, Skeleton, Tooltip, Typography } from 'antd';
import type { StatsMetric } from '@shop/contracts/stats/schemas';

import { deltaPercent, formatFigure } from './format';

/**
 * The headline figures of a statistics page.
 *
 * Every tile carries 环比 — the same figure over the window immediately before
 * this one — because a number without a comparison is not information. The
 * server decides when a comparison is meaningless (a running total like
 * 累计用户) by sending `previous: null`, and the tile then shows nothing rather
 * than a 0% that looks like "flat".
 */
export function MetricCards({
  metrics,
  loading,
  columns = 4,
}: {
  metrics: StatsMetric[] | undefined;
  loading?: boolean;
  columns?: 3 | 4 | 5;
}) {
  const span = { xs: 12, sm: 12, md: 8, lg: Math.floor(24 / columns) };

  if (loading && !metrics) {
    return (
      <Row gutter={[16, 16]}>
        {Array.from({ length: columns }, (_, index) => (
          <Col key={index} {...span}>
            <Card size="small">
              <Skeleton active paragraph={{ rows: 1 }} title={false} />
            </Card>
          </Col>
        ))}
      </Row>
    );
  }

  return (
    <Row gutter={[16, 16]}>
      {(metrics ?? []).map((metric) => (
        <Col key={metric.key} {...span}>
          <Card size="small">
            <Typography.Text type="secondary">{metric.label}</Typography.Text>
            <div style={{ fontSize: 24, lineHeight: '32px', fontVariantNumeric: 'tabular-nums' }}>
              {formatFigure(metric.value, metric.format)}
            </div>
            <MetricDelta metric={metric} />
          </Card>
        </Col>
      ))}
    </Row>
  );
}

function MetricDelta({ metric }: { metric: StatsMetric }) {
  const delta = deltaPercent(metric.value, metric.previous);
  if (delta === null) {
    return (
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {metric.previous === null ? '—' : '环比 —'}
      </Typography.Text>
    );
  }
  const up = delta >= 0;
  return (
    <Tooltip title={`上一周期 ${formatFigure(metric.previous ?? 0, metric.format)}`}>
      <Typography.Text type={up ? 'success' : 'danger'} style={{ fontSize: 12 }}>
        环比 {up ? <ArrowUpOutlined /> : <ArrowDownOutlined />} {Math.abs(delta).toFixed(2)}%
      </Typography.Text>
    </Tooltip>
  );
}
