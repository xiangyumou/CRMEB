'use client';

import { Alert, Card, Col, Row, Statistic, Typography } from 'antd';
import Link from 'next/link';

import { PageContainer } from '@/admin/kit/page-container';
import { useSession } from '@/admin/session/session-provider';

/**
 * Placeholder work surface. Stream F2 (`stats`) replaces the tiles with real
 * figures from `/admin-api/stats/*`; the frame and the kit usage stay.
 */
export function DashboardPage() {
  const { identity } = useSession();

  return (
    <PageContainer
      title={`你好，${identity.name}`}
      subTitle="这里会显示今日订单、销售额与待处理事项"
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="工作台数据待接入"
        description="Phase 0 只提供页面骨架。统计接口由 F2（stats）实现后，这里的指标会替换为真实数据。"
      />

      <Row gutter={[16, 16]}>
        {[
          { title: '今日订单', value: '—' },
          { title: '今日销售额', value: '—' },
          { title: '待发货', value: '—' },
          { title: '待处理退款', value: '—' },
        ].map((tile) => (
          <Col key={tile.title} xs={12} md={6}>
            <Card size="small">
              <Statistic title={tile.title} value={tile.value} />
            </Card>
          </Col>
        ))}
      </Row>

      {process.env.NODE_ENV === 'production' ? null : (
        <Card size="small" title="开发提示" style={{ marginTop: 16 }}>
          <Typography.Paragraph style={{ marginBottom: 0 }}>
            组件套件的用法与示例见 <Link href="/admin/dev/kit">组件套件演示</Link>， 以及{' '}
            <code>src/admin/kit/README.md</code>。
          </Typography.Paragraph>
        </Card>
      )}
    </PageContainer>
  );
}
