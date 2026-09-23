'use client';

import type { DiyBackgroundMode } from '@shop/contracts/diy/schema/page';
import { Button, ColorPicker, Input, Radio, Space } from 'antd';

import { DiyFieldRow, DiyImageField, DiySection } from './fields';
import { useDiyEditor } from './editor-context';

/**
 * 页面设置 — the right-hand pane when the page itself is selected.
 *
 * Four things: the page's internal name, the title bar text, a background
 * colour and a background image with a repeat mode. The contract names the
 * repeat mode (`full` / `repeat` / `fixed`) rather than storing an integer,
 * because nobody should have to remember that 2 means 满屏.
 */

const MODE_OPTIONS: { value: DiyBackgroundMode; label: string }[] = [
  { value: 'full', label: '满屏' },
  { value: 'repeat', label: '平铺' },
  { value: 'fixed', label: '固定' },
];

export function DiyPageSettings() {
  const { state, dispatch, readOnly } = useDiyEditor();
  const { meta } = state;
  const background = meta.background;

  const patchBackground = (patch: Partial<NonNullable<typeof background>>): void => {
    const next = { ...(background ?? {}), ...patch };
    const empty = !next.color && !next.imageUrl;
    dispatch({ type: 'patchMeta', patch: { background: empty ? null : next } });
  };

  return (
    <Space direction="vertical" size={0} style={{ width: '100%' }}>
      <DiySection title="页面信息">
        <DiyFieldRow label="页面名称" help="仅后台可见，用于在列表中找到这个页面">
          <Input
            value={meta.name}
            maxLength={100}
            disabled={readOnly}
            onChange={(event) =>
              dispatch({ type: 'patchMeta', patch: { name: event.target.value } })
            }
          />
        </DiyFieldRow>
        <DiyFieldRow label="页面标题" help="显示在手机顶部的标题栏">
          <Input
            value={meta.title ?? ''}
            maxLength={100}
            disabled={readOnly}
            placeholder="留空则使用页面名称"
            onChange={(event) =>
              dispatch({
                type: 'patchMeta',
                patch: { title: event.target.value === '' ? null : event.target.value },
              })
            }
          />
        </DiyFieldRow>
      </DiySection>

      <DiySection title="页面背景">
        <DiyFieldRow label="背景颜色">
          <Space>
            <ColorPicker
              disabled={readOnly}
              value={background?.color ?? '#F5F5F5'}
              showText
              size="small"
              onChangeComplete={(next) => patchBackground({ color: next.toHexString() })}
            />
            <Button
              type="link"
              size="small"
              disabled={readOnly || !background?.color}
              onClick={() => patchBackground({ color: undefined })}
            >
              清除
            </Button>
          </Space>
        </DiyFieldRow>
        <DiyFieldRow label="背景图片" help="建议尺寸 750px 宽">
          <DiyImageField
            value={background?.imageUrl ?? ''}
            disabled={readOnly}
            onChange={(imageUrl) => patchBackground({ imageUrl })}
          />
        </DiyFieldRow>
        <DiyFieldRow label="显示方式">
          <Radio.Group
            optionType="button"
            buttonStyle="solid"
            size="small"
            disabled={readOnly || !background?.imageUrl}
            value={background?.imageMode ?? 'full'}
            options={MODE_OPTIONS}
            onChange={(event) => patchBackground({ imageMode: event.target.value })}
          />
        </DiyFieldRow>
      </DiySection>
    </Space>
  );
}
