'use client';

import { Alert, Skeleton, Space, Typography } from 'antd';
import { systemConfigGet, systemConfigSave } from '@shop/contracts/system/system.settings.contract';

import { useRouteQuery } from '@/admin/api/hooks';
import { ConfigGroupForm } from '@/admin/kit/config/config-group-form';
import type { ConfigFieldDescriptor } from '@/admin/kit/config/types';
import { InstantText } from '@/admin/kit/instant-text';
import { PageContainer } from '@/admin/kit/page-container';

import { MiniTradePanel } from './mini-trade-panel';

/** Groups whose screen carries an action beside the form. */
const PANELS: Record<string, () => React.ReactNode> = {
  'wechat-mini-trade': () => <MiniTradePanel />,
};

/**
 * One settings screen, for every config group there is.
 *
 * The 575-key `sys_config` table and its hand-built screens are replaced by
 * this: the server sends a descriptor, the kit renders it, the same route saves
 * it. Adding a setting is a line in a `*.config.ts`, not a page.
 *
 * Secrets never arrive here. A `password` field's value in `values` is a
 * boolean "is set" flag, and the form only sends that key when the operator
 * typed a new value — so saving the site name cannot blank out a credential.
 */
export function SettingsGroupPage({ group }: { group: string }) {
  const input = { params: { group } };
  const { data, isPending, error } = useRouteQuery(systemConfigGet, input, {
    presentError: false,
  });

  if (isPending) {
    return (
      <PageContainer>
        <Skeleton active paragraph={{ rows: 8 }} />
      </PageContainer>
    );
  }

  if (error || !data) {
    return (
      <PageContainer breadcrumb={false}>
        <Alert
          type="error"
          showIcon
          message="打不开这个配置分组"
          description={error?.message ?? '配置分组不存在'}
        />
      </PageContainer>
    );
  }

  const writable = data.descriptor.fields.length > 0;

  return (
    <PageContainer
      title={data.descriptor.title}
      breadcrumb={[
        { label: '系统设置', href: '/admin/system/settings' },
        { label: data.descriptor.title },
      ]}
      extra={
        data.updatedAt ? (
          <Typography.Text type="secondary">
            最后修改 <InstantText value={data.updatedAt} />
          </Typography.Text>
        ) : undefined
      }
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <ConfigGroupForm
          descriptor={{
            group: data.descriptor.group,
            title: data.descriptor.title,
            ...(data.descriptor.description === undefined
              ? {}
              : { description: data.descriptor.description }),
            fields: data.descriptor.fields.map(toKitField),
          }}
          values={data.values}
          route={systemConfigSave}
          toInput={(payload) => ({ params: { group }, body: { values: payload } })}
          invalidate={[systemConfigGet]}
          successMessage="已保存"
          disabled={!writable}
        />
        {PANELS[group]?.() ?? null}
      </Space>
    </PageContainer>
  );
}

/**
 * Contract descriptor → kit descriptor.
 *
 * The two shapes agree field for field, so this is a copy: the only work is
 * dropping keys that are `undefined`, which `exactOptionalPropertyTypes`
 * requires. The server sorts fields by section, and the kit renders each run
 * under its heading.
 */
function toKitField(field: {
  key: string;
  label: string;
  kind: ConfigFieldDescriptor['kind'];
  help?: string | undefined;
  placeholder?: string | undefined;
  options?: { label: string; value: string | number | boolean }[] | undefined;
  section?: string | undefined;
  multiple?: boolean | undefined;
  visibleWhen?: { key: string; equals: unknown } | undefined;
}): ConfigFieldDescriptor {
  return {
    key: field.key,
    label: field.label,
    kind: field.kind,
    ...(field.help === undefined ? {} : { help: field.help }),
    ...(field.placeholder === undefined ? {} : { placeholder: field.placeholder }),
    ...(field.options === undefined ? {} : { options: field.options }),
    ...(field.section === undefined ? {} : { section: field.section }),
    ...(field.multiple === undefined ? {} : { multiple: field.multiple }),
    ...(field.visibleWhen === undefined ? {} : { visibleWhen: field.visibleWhen }),
  };
}
