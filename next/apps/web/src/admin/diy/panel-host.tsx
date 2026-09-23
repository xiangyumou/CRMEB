'use client';

import { Alert, Button, Input, Space, Typography } from 'antd';
import { useState } from 'react';

import type { DiyComponentValue, DiyPanelContext, DiyPanelRegistry } from './panel-api';

/**
 * Renders the panel registered for a node, or a raw JSON editor when there is
 * none.
 *
 * The fallback is not a placeholder to be removed later. Three keys
 * (`newVip`, `presale`, `swipers`) have no editor UI by design, and a page
 * imported from a newer CRMEB build can hold a component this code has never
 * seen. In both cases the operator must still be able to look at the
 * node — and, at their own risk, fix it — rather than lose it on the next save.
 */

export interface DiyPanelHostProps {
  registry: DiyPanelRegistry;
  value: DiyComponentValue;
  onChange: (next: DiyComponentValue) => void;
  ctx: DiyPanelContext;
}

export function DiyPanelHost({ registry, value, onChange, ctx }: DiyPanelHostProps) {
  const definition = registry.get(ctx.componentKey);
  if (definition) {
    const Panel = definition.Panel;
    return <Panel value={value} onChange={onChange} ctx={ctx} />;
  }
  return <DiyRawPanel value={value} onChange={onChange} ctx={ctx} />;
}

export function DiyRawPanel({ value, onChange, ctx }: Omit<DiyPanelHostProps, 'registry'>) {
  const [draft, setDraft] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState<string | null>(null);

  const apply = (): void => {
    try {
      const parsed: unknown = JSON.parse(draft);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setError('内容必须是一个对象');
        return;
      }
      setError(null);
      onChange(parsed as DiyComponentValue);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      <Alert
        type="info"
        showIcon
        message={`组件 ${ctx.componentKey} 暂无配置面板`}
        description="可直接编辑原始数据；保存后按原样写回，不会丢失任何字段。"
      />
      <Input.TextArea
        rows={18}
        value={draft}
        disabled={ctx.disabled}
        onChange={(event) => setDraft(event.target.value)}
        style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}
      />
      {error ? <Typography.Text type="danger">{error}</Typography.Text> : null}
      <Button onClick={apply} disabled={ctx.disabled}>
        应用
      </Button>
    </Space>
  );
}
