'use client';

import { pageFootSchema, type PageFootComponent } from '@shop/contracts/diy/schema/pageFoot.schema';
import { Input } from 'antd';

import { SortableListField } from '@/admin/kit/form/sortable-list-field';

import { pageFootDefault } from '../defaults/pageFoot.default';
import {
  DiyColourField,
  DiyFieldRow,
  DiyFilletField,
  DiyImageField,
  DiyLinkField,
  DiySection,
  DiySetUpTabs,
  DiySliderField,
  DiyTabsField,
} from '../fields';
import { bindDiyPanel, defineDiyPanel } from '../panel-api';

/**
 * 底部导航 — ports `pageFoot.vue` (the panel; the singleton, not a palette entry).
 *
 * The one component that does **not** end in `c_common_style`: it has no
 * `paddingConfig`, `marginConfig`, `componentBgConfig`, `borderConfig` or
 * `shadowConfig` at all, and spaces itself with the pre-`paddingConfig`
 * `topConfig` / `bottomConfig` / `prConfig` / `mbConfig` sliders. Hence the
 * hand-written 通用样式 section here.
 *
 * Three indices, from `getRComStyle` (`pageFoot.vue:265-313`):
 *
 * - `navConfig.tabVal` — `0` 底部固定 uses `bgColor`; 底部悬浮 uses `bgColor2`
 *   and additionally offers 左右边距 / 下边距 / 圆角, which a fixed bar cannot have.
 * - `navStyleConfig.tabVal` — `2` (图片) hides the text colours entirely.
 * - `toneConfig.tabVal` — `0` follows the theme, otherwise the two text colours.
 *
 * `effectConfig` (展示效果) is commented out at `:235-238` and gets no control.
 *
 * `menuList` is a **bare array at the top level**, not a `{list}` config object,
 * so it goes through the kit's `SortableListField` rather than
 * `DiySortableListField`. `imgList` is positional: `[0]` 选中, `[1]` 未选中
 * (`c_foot.vue:26`).
 */

interface FootMenu {
  imgList?: string[];
  name?: string;
  link?: string;
  [key: string]: unknown;
}

export default defineDiyPanel<PageFootComponent>({
  key: 'pageFoot',
  schema: pageFootSchema,
  createDefault: () => structuredClone(pageFootDefault),
  label: '底部导航',
  description: '页面底部的导航栏，每页只有一个',
  Panel({ value, onChange, ctx }) {
    const f = bindDiyPanel(value, onChange, ctx.disabled);
    const floating = Number(value.navConfig?.tabVal ?? 0) !== 0;
    const navStyle = Number(value.navStyleConfig?.tabVal ?? 0);
    const customTone = Number(value.toneConfig?.tabVal ?? 0) !== 0;
    const menus = (value.menuList ?? []) as FootMenu[];

    return (
      <>
        <DiySetUpTabs value={f.tab} onChange={f.setTab} disabled={ctx.disabled} />

        <DiySection title={value.titleLeft ?? '展示设置'} when={f.tab === 0}>
          <DiyTabsField {...f.bind('navConfig')} />
          <DiyTabsField {...f.bind('navStyleConfig')} />
        </DiySection>

        <DiySection title={value.titleNav ?? '导航设置'} when={f.tab === 0}>
          <DiyFieldRow help="图片建议宽度81*81px；拖拽左侧手柄可调整导航顺序">
            <span style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary)' }}>
              {menus.length} / 5
            </span>
          </DiyFieldRow>
          <SortableListField<FootMenu>
            value={menus}
            onChange={(next) => f.patch({ menuList: next })}
            disabled={ctx.disabled}
            max={5}
            addText="添加板块"
            newItem={() => ({ imgList: ['', ''], name: '', link: '' })}
            renderItem={(item, { set }) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {navStyle !== 1 ? (
                  <DiyFieldRow label="图标">
                    <div style={{ display: 'flex', gap: 12 }}>
                      {['选中', '未选中'].map((caption, index) => (
                        <DiyImageField
                          key={caption}
                          value={item.imgList?.[index] ?? ''}
                          onChange={(url) => {
                            const imgList = [...(item.imgList ?? [])];
                            imgList[index] = url;
                            set({ ...item, imgList });
                          }}
                          disabled={ctx.disabled}
                          size={48}
                          label={caption}
                        />
                      ))}
                    </div>
                  </DiyFieldRow>
                ) : null}
                {navStyle !== 2 ? (
                  <DiyFieldRow label="名称">
                    <Input
                      disabled={ctx.disabled}
                      value={item.name ?? ''}
                      maxLength={10}
                      placeholder="选填不超过10个字"
                      onChange={(event) => set({ ...item, name: event.target.value })}
                    />
                  </DiyFieldRow>
                ) : null}
                <DiyLinkField
                  value={item.link ?? ''}
                  onChange={(link) => set({ ...item, link })}
                  disabled={ctx.disabled}
                  label="链接"
                />
              </div>
            )}
          />
        </DiySection>

        <DiySection title={value.titleRight ?? '导航样式'} when={f.tab === 1 && navStyle !== 2}>
          <DiyTabsField {...f.bind('toneConfig')} />
          {customTone ? (
            <>
              <DiyColourField {...f.bind('activeTxtColor')} />
              <DiyColourField {...f.bind('txtColor')} />
            </>
          ) : null}
        </DiySection>

        <DiySection title={value.titleCurrency ?? '通用样式'} when={f.tab === 1}>
          <DiyColourField {...(floating ? f.bind('bgColor2') : f.bind('bgColor'))} />
          <DiySliderField {...f.bind('topConfig')} />
          <DiySliderField {...f.bind('bottomConfig')} />
          {floating ? (
            <>
              <DiySliderField {...f.bind('prConfig')} />
              <DiySliderField {...f.bind('mbConfig')} />
              <DiyFilletField {...f.bind('fillet')} />
            </>
          ) : null}
        </DiySection>
      </>
    );
  },
});
