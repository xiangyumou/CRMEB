'use client';

import { Space, Tag, Typography } from 'antd';
import {
  notificationAdminTemplateList,
  notificationAdminTemplateUpdate,
} from '@shop/contracts/notification/notification.admin.contract';
import {
  notificationTemplateForm,
  type NotificationChannel,
  type NotificationTemplate,
} from '@shop/contracts/notification/schemas';

import { ModalForm, useFormModal } from '@/admin/kit/form/modal-form';
import type { FieldSpec } from '@/admin/kit/form/types';
import { PageContainer } from '@/admin/kit/page-container';
import { StatusTag } from '@/admin/kit/status-tag';
import { enumColumn, instantColumn, textColumn } from '@/admin/kit/table/columns';
import { CrudTable } from '@/admin/kit/table/crud-table';

import { NOTIFICATION_AUDIENCE, NOTIFICATION_CHANNEL } from '../notification-enums';
import { FieldMapField } from './field-map-field';
import { NotificationPreviewButton } from './notification-preview';

/**
 * 通知模板 — which events the shop sends, and down which channels.
 *
 * The rows come from the **code**, not from the table: the registry in
 * `core/src/notification/notification.registry.ts` is what the system can
 * actually send, and the table only remembers the operator's choices. So there
 * is no 新建 button and no delete — an event nobody wrote code for could never
 * fire, and a row for it would only invite operators to keep editing it.
 *
 * Only the channels an event supports get switches. A customer event has no
 * admin inbox and an admin event has no openid, so offering the switch would be
 * offering a setting that silently does nothing.
 */
export function NotificationTemplatesPage() {
  const modal = useFormModal<NotificationTemplate>();

  return (
    <PageContainer subTitle="事件由代码定义，这里只决定发哪些渠道、用什么措辞。改完在配置窗口里「预览」看实际效果">
      <CrudTable
        route={notificationAdminTemplateList}
        scrollX={1200}
        filters={[
          { kind: 'text', name: 'keyword', label: '名称或编码' },
          {
            kind: 'select',
            name: 'audience',
            label: '接收方',
            options: Object.entries(NOTIFICATION_AUDIENCE).map(([value, option]) => ({
              value,
              label: option.label,
            })),
          },
        ]}
        columns={[
          textColumn<NotificationTemplate>({ title: '名称', dataIndex: 'name', ellipsis: true }),
          textColumn<NotificationTemplate>({ title: '编码', dataIndex: 'code', width: 200 }),
          enumColumn<NotificationTemplate, NotificationTemplate['audience']>({
            title: '接收方',
            dataIndex: 'audience',
            map: NOTIFICATION_AUDIENCE,
          }),
          {
            title: '已启用渠道',
            key: 'channels',
            width: 260,
            render: (_value: unknown, row: NotificationTemplate) => {
              const on = row.supportedChannels.filter((channel) => row.channels[channel]?.enabled);
              if (on.length === 0)
                return <Typography.Text type="secondary">未启用</Typography.Text>;
              return (
                <Space size={4} wrap>
                  {on.map((channel) => (
                    <StatusTag key={channel} value={channel} map={NOTIFICATION_CHANNEL} />
                  ))}
                </Space>
              );
            },
          },
          {
            title: '总开关',
            key: 'isEnabled',
            width: 90,
            render: (_value: unknown, row: NotificationTemplate) =>
              row.isEnabled ? <Tag color="success">开</Tag> : <Tag>关</Tag>,
          },
          instantColumn<NotificationTemplate>({ title: '更新时间', dataIndex: 'updatedAt' }),
          {
            title: '操作',
            key: 'actions',
            width: 90,
            fixed: 'right' as const,
            render: (_value: unknown, row: NotificationTemplate) => (
              <Typography.Link onClick={() => modal.show(row)}>配置</Typography.Link>
            ),
          },
        ]}
      />

      {modal.record ? (
        <ModalForm
          {...modal.props}
          key={modal.record.code}
          title={`配置：${modal.record.name}`}
          width={860}
          columns={1}
          schema={notificationTemplateForm}
          fields={fieldsFor(modal.record)}
          initialValues={{ channels: modal.record.channels, isEnabled: modal.record.isEnabled }}
          route={notificationAdminTemplateUpdate}
          toInput={(values) => ({ params: { code: modal.record!.code }, body: values })}
          invalidate={[notificationAdminTemplateList]}
          successMessage="已保存"
          header={<Placeholders variables={modal.record.variables} />}
          footerExtra={(form) => <NotificationPreviewButton template={modal.record!} form={form} />}
        />
      ) : null}
    </PageContainer>
  );
}

/** The `{{…}}` names this event provides. Without them the form is guesswork. */
function Placeholders({ variables }: { variables: readonly string[] }) {
  if (variables.length === 0) return null;
  return (
    <Typography.Paragraph type="secondary">
      可用占位符：
      {variables.map((name) => (
        <Typography.Text key={name} code>
          {`{{${name}}}`}
        </Typography.Text>
      ))}
    </Typography.Paragraph>
  );
}

type FormField = FieldSpec<'channels' | 'isEnabled'>;

/**
 * One block of fields per supported channel, plus the master switch.
 *
 * `visibleWhen` hides a channel's details until it is switched on: the form is
 * four channels wide and an operator editing the in-app copy does not
 * need to scroll past three WeChat template ids they are not using.
 */
function fieldsFor(template: NotificationTemplate): FormField[] {
  const fields: FormField[] = [
    {
      kind: 'switch',
      name: 'isEnabled',
      label: '总开关',
      help: '关闭后该事件的所有渠道都不发送，已排队的发送也会跳过',
    },
  ];

  const enabled = (channel: NotificationChannel) => (values: Record<string, unknown>) =>
    Boolean(
      (values['channels'] as Record<string, { enabled?: boolean }> | undefined)?.[channel]?.enabled,
    );

  for (const channel of template.supportedChannels) {
    fields.push({
      kind: 'switch',
      name: ['channels', channel, 'enabled'],
      label: `${NOTIFICATION_CHANNEL[channel].label} 渠道`,
    });

    if (channel === 'inApp') {
      fields.push(
        {
          kind: 'text',
          name: ['channels', 'inApp', 'title'],
          label: '站内信标题',
          visibleWhen: enabled('inApp'),
        },
        {
          kind: 'textarea',
          name: ['channels', 'inApp', 'body'],
          label: '站内信正文',
          rows: 3,
          visibleWhen: enabled('inApp'),
        },
      );
      continue;
    }

    if (channel === 'sms') {
      fields.push(
        {
          kind: 'text',
          name: ['channels', 'sms', 'templateCode'],
          label: '短信模板编号',
          help: '服务商侧的模板 ID，例如 SMS_123456',
          visibleWhen: enabled('sms'),
        },
        {
          kind: 'text',
          name: ['channels', 'sms', 'signName'],
          label: '短信签名',
          visibleWhen: enabled('sms'),
        },
        {
          kind: 'textarea',
          name: ['channels', 'sms', 'body'],
          label: '短信内容（备注）',
          rows: 2,
          help: '仅供查阅，真正的文案由服务商保存',
          visibleWhen: enabled('sms'),
        },
      );
      continue;
    }

    // wechatOa / wechatMini share a shape.
    fields.push(
      {
        kind: 'text',
        name: ['channels', channel, 'templateKey'],
        label: '模板库编号',
        help: '公众平台上可查的 OPENTM / TM 编号，换店铺时用它重新找回模板',
        visibleWhen: enabled(channel),
      },
      {
        kind: 'text',
        name: ['channels', channel, 'templateId'],
        label: '模板 ID',
        help: '本账号添加模板后得到的 ID，接口真正使用的是它',
        visibleWhen: enabled(channel),
      },
      {
        kind: 'custom',
        name: ['channels', channel, 'fields'],
        label: '字段映射',
        help: '左边是微信模板的字段名（first、keyword1、thing3…），右边是我们的占位符',
        visibleWhen: enabled(channel),
        render: ({ value, onChange, disabled }) => (
          <FieldMapField
            value={value as Record<string, string> | undefined}
            onChange={onChange as (next: Record<string, string>) => void}
            disabled={disabled}
            variables={template.variables}
          />
        ),
      },
    );
    // The mini program's page is the event's own route; only the 公众号
    // message takes a hand-typed link.
    if (channel === 'wechatOa') {
      fields.push({
        kind: 'text',
        name: ['channels', 'wechatOa', 'linkUrl'],
        label: '点击跳转',
        visibleWhen: enabled('wechatOa'),
      });
    }
  }

  return fields;
}
