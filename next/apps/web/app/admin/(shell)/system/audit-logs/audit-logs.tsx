'use client';

import { Button, Descriptions, Drawer, Tag, Typography } from 'antd';
import { useState } from 'react';
import { systemAuditLogList } from '@shop/contracts/system/system.settings.contract';
import type { AuditLogItem } from '@shop/contracts/system/schemas';

import { InstantText } from '@/admin/kit/instant-text';
import { PageContainer } from '@/admin/kit/page-container';
import { actionsColumn, idColumn, instantColumn, textColumn } from '@/admin/kit/table/columns';
import { CrudTable } from '@/admin/kit/table/crud-table';

const METHOD_COLOUR: Record<string, string> = {
  POST: 'blue',
  PUT: 'orange',
  PATCH: 'orange',
  DELETE: 'red',
};

/**
 * 操作日志.
 *
 * Read-only by design: there is no delete button and no route behind one. The
 * log is pruned on a schedule by `system.pruneAuditLogs`, which is a retention
 * policy an operator sets in 系统设置, not a button somebody can reach for after
 * a mistake.
 *
 * Only writes are recorded (`handle()` skips GET), and the stored payload has
 * already been redacted — a password field never reaches this table.
 */
export function AuditLogsPage() {
  const [viewing, setViewing] = useState<AuditLogItem | null>(null);

  return (
    <PageContainer subTitle="后台的写操作记录；只读，按设置的保留天数自动清理">
      <CrudTable
        route={systemAuditLogList}
        scrollX={1200}
        filters={[
          { kind: 'text', name: 'keyword', label: '接口/路径/对象' },
          { kind: 'text', name: 'adminId', label: '管理员 ID' },
          {
            kind: 'select',
            name: 'method',
            label: '方法',
            options: ['POST', 'PUT', 'PATCH', 'DELETE'].map((value) => ({ value, label: value })),
          },
          { kind: 'dateRange', names: ['createdFrom', 'createdTo'], label: '时间' },
        ]}
        columns={[
          idColumn<AuditLogItem>({ sortable: true }),
          instantColumn<AuditLogItem>({
            title: '时间',
            dataIndex: 'createdAt',
            sortable: true,
            width: 180,
          }),
          {
            title: '操作人',
            key: 'adminAccount',
            width: 140,
            render: (_value: unknown, row: AuditLogItem) => (
              <>
                {row.adminAccount}
                {row.adminId === null && (
                  <Typography.Text type="secondary"> （已删除）</Typography.Text>
                )}
              </>
            ),
          },
          {
            title: '方法',
            key: 'method',
            width: 90,
            render: (_value: unknown, row: AuditLogItem) => (
              <Tag color={METHOD_COLOUR[row.method] ?? 'default'}>{row.method}</Tag>
            ),
          },
          textColumn<AuditLogItem>({ title: '接口', dataIndex: 'routeId', ellipsis: true }),
          textColumn<AuditLogItem>({ title: '路径', dataIndex: 'path', ellipsis: true }),
          textColumn<AuditLogItem>({ title: '对象', dataIndex: 'target', width: 140 }),
          {
            title: '结果',
            key: 'status',
            width: 90,
            render: (_value: unknown, row: AuditLogItem) => (
              <Tag color={row.status < 400 ? 'success' : 'error'}>{row.status}</Tag>
            ),
          },
          actionsColumn<AuditLogItem>({
            width: 90,
            render: (row) => (
              <Button type="link" size="small" onClick={() => setViewing(row)}>
                详情
              </Button>
            ),
          }),
        ]}
      />

      <Drawer
        open={viewing !== null}
        onClose={() => setViewing(null)}
        width={640}
        title={viewing ? `${viewing.method} ${viewing.routeId}` : '日志详情'}
      >
        {viewing && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="时间">
              <InstantText value={viewing.createdAt} />
            </Descriptions.Item>
            <Descriptions.Item label="操作人">
              {viewing.adminAccount}
              {viewing.adminId !== null && `（#${viewing.adminId}）`}
            </Descriptions.Item>
            <Descriptions.Item label="路径">{viewing.path}</Descriptions.Item>
            <Descriptions.Item label="对象">{viewing.target ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="结果">{viewing.status}</Descriptions.Item>
            <Descriptions.Item label="IP">{viewing.ip ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="请求 ID">
              <Typography.Text copyable>{viewing.requestId}</Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="请求内容">
              <Typography.Paragraph
                style={{ marginBottom: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
              >
                {prettyPayload(viewing.payload)}
              </Typography.Paragraph>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </PageContainer>
  );
}

/**
 * The payload is stored as text, already redacted. Pretty-print it when it
 * parses and show it verbatim when it does not — a log viewer that throws on
 * malformed history is worse than one that shows the history.
 */
function prettyPayload(payload: string | null): string {
  if (!payload) return '—';
  try {
    return JSON.stringify(JSON.parse(payload), null, 2);
  } catch {
    return payload;
  }
}
