'use client';

import { hotspotSchema, type HotspotComponent } from '@shop/contracts/diy/schema/hotspot.schema';
import { InputNumber } from 'antd';

import { hotspotDefault } from '../defaults/hotspot.default';
import {
  DiyFieldRow,
  DiyImageField,
  DiyLinkField,
  DiySection,
  DiySetUpTabs,
  DiySortableListField,
} from '../fields';
import { bindDiyPanel, defineDiyPanel } from '../panel-api';
import { DiyCommonStyleSection } from './_fields';

/**
 * 热区 — ports `c_hotspot.vue`, whose 内容设置 tab is a single `c_one_pictrue`.
 *
 * A hot area is `{number, starX, starY, areaWidth, areaHeight, link}` in **rpx**,
 * read verbatim by `hotspot.vue:12-19` as `top/left/width/height`. The legacy
 * editor draws the rectangles on the image (`OperationFloorModal`); here they
 * are typed. Same four numbers, same key names, same units — an area drawn in
 * the old admin opens here and saves back identically.
 *
 * `number` is the row's identity (`:key="item.number"` in the renderer), so a
 * new row gets the next free one rather than the row count, which would repeat
 * after a delete.
 */

interface HotArea {
  number?: number;
  starX?: number;
  starY?: number;
  areaWidth?: number;
  areaHeight?: number;
  link?: string;
  [key: string]: unknown;
}

const COORDS = [
  ['starX', '左'],
  ['starY', '上'],
  ['areaWidth', '宽'],
  ['areaHeight', '高'],
] as const;

export default defineDiyPanel<HotspotComponent>({
  key: 'hotspot',
  schema: hotspotSchema,
  createDefault: () => structuredClone(hotspotDefault),
  label: '热区',
  description: '一张图片加若干可点击区域',
  Panel({ value, onChange, ctx }) {
    const f = bindDiyPanel(value, onChange, ctx.disabled);
    const picStyle = (value.picStyle ?? {}) as { url?: string; list?: unknown[] };
    const areas = (picStyle.list ?? []) as HotArea[];

    const patchPic = (next: Partial<{ url: string; list: HotArea[] }>): void =>
      f.patch({ picStyle: { ...picStyle, ...next } });

    return (
      <>
        <DiySetUpTabs value={f.tab} onChange={f.setTab} disabled={ctx.disabled} />

        <DiySection title={value.titleLeft ?? '内容设置'} when={f.tab === 0}>
          <DiyImageField
            value={picStyle.url ?? ''}
            onChange={(url) => patchPic({ url })}
            disabled={ctx.disabled}
            label="图片"
            size={96}
            tip="建议：请先选择图片，图片宽度750px，高度不限"
          />
          <DiySortableListField<HotArea>
            value={{ list: areas }}
            onChange={(next) => patchPic({ list: (next.list ?? []) as HotArea[] })}
            disabled={ctx.disabled}
            label="热区"
            addText="编辑热区"
            newItem={() => ({
              number: areas.reduce((max, area) => Math.max(max, Number(area.number ?? 0)), 0) + 1,
              starX: 0,
              starY: 0,
              areaWidth: 100,
              areaHeight: 100,
              link: '',
            })}
            renderItem={(area, set) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <DiyFieldRow label="位置 / 尺寸" help="单位 rpx，750rpx 为屏幕宽度">
                  <div style={{ display: 'flex', gap: 8 }}>
                    {COORDS.map(([key, label]) => (
                      <InputNumber
                        key={key}
                        disabled={ctx.disabled}
                        size="small"
                        min={0}
                        addonBefore={label}
                        value={Number(area[key] ?? 0)}
                        onChange={(next) => set({ ...area, [key]: next ?? 0 })}
                      />
                    ))}
                  </div>
                </DiyFieldRow>
                <DiyLinkField
                  value={area.link ?? ''}
                  onChange={(link) => set({ ...area, link })}
                  disabled={ctx.disabled}
                  label="链接"
                />
              </div>
            )}
          />
        </DiySection>

        <DiyCommonStyleSection
          value={value}
          onChange={onChange}
          disabled={ctx.disabled}
          title={value.titleRight ?? '样式设置'}
          when={f.tab === 1}
        />
      </>
    );
  },
});
