'use client';

import type { DiyComponentKey } from '@shop/contracts/diy/schema/registry';
import { Button, Popconfirm, Space, Typography } from 'antd';
import { useMemo } from 'react';

import { useDiyEditor } from './editor-context';
import { DiyPageSettings } from './page-settings';
import { componentLabel } from './palette';
import { DiyPanelHost } from './panel-host';
import type { DiyPanelContext, DiyPanelRegistry } from './panel-api';
import { diyPanelRegistry } from './panels';
import { DIY_PAGE_SELECTION, selectedNode } from './store';

/**
 * The right-hand pane.
 *
 * Its whole job is to turn the current selection into a `DiyPanelContext` and
 * hand it to `<DiyPanelHost>`. Everything a config panel is allowed to do —
 * change its node, reset it, remove it — arrives through that context and
 * nothing else, so a panel is written against a stable interface without ever
 * touching this file.
 */

export function DiyInspector({ registry = diyPanelRegistry }: { registry?: DiyPanelRegistry }) {
  const { state, dispatch, readOnly, theme } = useDiyEditor();
  const node = selectedNode(state);
  const isFooter = node !== null && state.footer?.uid === node.uid;

  const ctx = useMemo<DiyPanelContext | null>(() => {
    if (!node) return null;
    const componentKey = (
      typeof node.value.name === 'string' ? node.value.name : ''
    ) as DiyComponentKey;
    const base: DiyPanelContext = {
      componentKey,
      pageKind: state.meta.kind,
      theme,
      reset: () => dispatch({ type: 'reset', uid: node.uid }),
      disabled: readOnly,
    };
    // `pageFoot` / `bottomMenu` belong to the page, so their panel gets no
    // remove button — exactly what the panel API promises.
    return isFooter ? base : { ...base, remove: () => dispatch({ type: 'remove', uid: node.uid }) };
  }, [node, state.meta.kind, theme, readOnly, isFooter, dispatch]);

  if (state.selected === DIY_PAGE_SELECTION || !node || !ctx) return <DiyPageSettings />;

  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          paddingBottom: 8,
          borderBottom: '1px solid var(--ant-color-border-secondary, #f0f0f0)',
        }}
      >
        <Typography.Text strong>{componentLabel(ctx.componentKey)}</Typography.Text>
        <Space size={4}>
          <Popconfirm title="将该组件恢复为默认配置？" onConfirm={ctx.reset} disabled={readOnly}>
            <Button size="small" type="link" disabled={readOnly}>
              恢复默认
            </Button>
          </Popconfirm>
          {ctx.remove ? (
            <Button size="small" type="link" danger disabled={readOnly} onClick={ctx.remove}>
              删除
            </Button>
          ) : null}
        </Space>
      </div>

      <DiyPanelHost
        registry={registry}
        value={node.value}
        onChange={(value) => dispatch({ type: 'update', uid: node.uid, value })}
        ctx={ctx}
      />
    </Space>
  );
}
