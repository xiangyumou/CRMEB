'use client';

import { Card, Col, Empty, Row, Skeleton, Tag, Typography } from 'antd';
import Link from 'next/link';
import { systemConfigGroupList } from '@shop/contracts/system/system.settings.contract';

import { useRouteQuery } from '@/admin/api/hooks';
import { PageContainer } from '@/admin/kit/page-container';

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
    <PageContainer subTitle="每个分组是一屏配置；分组由各业务域在代码里声明，这里只是入口">
      {groups.length === 0 ? (
        <Empty description="没有你有权查看的配置分组" />
      ) : (
        <Row gutter={[16, 16]}>
          {groups.map((group) => (
            <Col key={group.group} xs={24} sm={12} lg={8}>
              <Link href={`/admin/system/settings/${group.group}`}>
                <Card hoverable title={group.title} size="small" style={{ height: '100%' }}>
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
      )}
    </PageContainer>
  );
}
