'use client';

import { Card, Col, Empty, Row, Skeleton, Space, Tag, Tooltip, Typography } from 'antd';
import Link from 'next/link';
import { systemConfigGroupList } from '@shop/contracts/system/system.settings.contract';

import { useRouteQuery } from '@/admin/api/hooks';
import { InstantText } from '@/admin/kit/instant-text';
import { PageContainer } from '@/admin/kit/page-container';

/** The index's blocks, in page order. A group that names none lands in 业务规则. */
const CATEGORIES = [
  { key: 'basic', title: '基础' },
  { key: 'wechat', title: '微信' },
  { key: 'trade', title: '支付与交易' },
  { key: 'integration', title: '第三方服务' },
  { key: 'rules', title: '业务规则' },
] as const;

/**
 * 系统设置 — the index of config groups.
 *
 * There is no hand-written list here: the groups are whatever the code declared
 * with `defineConfigGroup`, filtered by what the caller may read. A domain that
 * adds a group gets a card on this page and a working settings screen without
 * anybody editing this file, which is the point of the whole arrangement.
 */
export function SettingsIndexPage() {
  const { data, isPending } = useRouteQuery(systemConfigGroupList);

  if (isPending) {
    return (
      <PageContainer>
        <Skeleton active />
      </PageContainer>
    );
  }

  const groups = data?.groups ?? [];

  return (
    <PageContainer subTitle="每个分组是一屏配置；带「测试」的分组可以在保存前先验证">
      {groups.length === 0 ? (
        <Empty description="没有你有权查看的配置分组" />
      ) : (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {CATEGORIES.map((category) => {
            const members = groups.filter((group) => (group.category ?? 'rules') === category.key);
            if (members.length === 0) return null;
            return (
              <section key={category.key}>
                <Typography.Title level={5} style={{ marginTop: 0 }}>
                  {category.title}
                </Typography.Title>
                <Row gutter={[16, 16]}>
                  {members.map((group) => (
                    <Col key={group.group} xs={24} sm={12} lg={8} xxl={6}>
                      <Link href={`/admin/system/settings/${group.group}`}>
                        <Card
                          hoverable
                          title={group.title}
                          size="small"
                          style={{ height: '100%' }}
                          extra={<GroupStatus group={group} />}
                        >
                          <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }}>
                            {group.description ?? '　'}
                          </Typography.Paragraph>
                          <Typography.Text type="secondary">{group.fieldCount} 项</Typography.Text>
                          {!group.writable && (
                            <Tag style={{ marginLeft: 8 }} color="default">
                              只读
                            </Tag>
                          )}
                        </Card>
                      </Link>
                    </Col>
                  ))}
                </Row>
              </section>
            );
          })}
        </Space>
      )}
    </PageContainer>
  );
}

function GroupStatus({
  group,
}: {
  group: {
    testable?: boolean | undefined;
    lastTest?: { ok: boolean; at: string } | null | undefined;
  };
}) {
  if (!group.testable) return null;
  if (!group.lastTest) {
    return (
      <Tag bordered={false} color="default">
        未测试
      </Tag>
    );
  }
  return (
    <Tooltip
      title={
        <>
          上次测试 <InstantText value={group.lastTest.at} />
        </>
      }
    >
      <Tag bordered={false} color={group.lastTest.ok ? 'success' : 'error'}>
        {group.lastTest.ok ? '测试通过' : '测试未通过'}
      </Tag>
    </Tooltip>
  );
}
