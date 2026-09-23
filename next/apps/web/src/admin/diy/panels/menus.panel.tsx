'use client';

import { menusSchema, type MenusComponent } from '@shop/contracts/diy/schema/menus.schema';

import { menusDefault } from '../defaults/menus.default';
import {
  DiyColourField,
  DiyCommonStyleSection,
  DiyEnableField,
  DiyFilletField,
  DiyMenuListField,
  DiySection,
  DiySetUpTabs,
  DiyTabsField,
  DiyTextConfigField,
} from '../fields';
import { bindDiyPanel, defineDiyPanel } from '../panel-api';
import { DiyGridItemStyleField, DiyHeaderStyleField, DiyIconStyleField } from './_fields';
import type { DiyIconStyleValue } from './_fields';

/**
 * 导航组, the most conditional panel in the set.
 *
 * Four indices:
 *
 * - `menuStyleConfig.tabVal` — `0` 排列展示 (offers 单行显示), `1` 宫格展示
 *   (offers 宫格样式 and 宫格项样式), `2` 列表展示 (offers neither).
 * - `showConfig.tabVal` — `1` 分页滑动 adds 显示行数.
 * - `headerConfig.enable` — gates the two corner texts and the header style.
 * - `toneConfig.tabVal` — the indicator colours, and only when 分页滑动 is on.
 *
 * **`iconStyleConfig` is rendered when the list is in 图标 mode.** The
 * storefront's `menus.vue` reads `iconStyleConfig.position`, and `c_menu_list`
 * lets an operator switch to 图标; without this block they would have icons
 * they cannot style. Every key written here
 * is one the factory default already defines.
 */
export default defineDiyPanel<MenusComponent>({
  key: 'menus',
  schema: menusSchema,
  createDefault: () => structuredClone(menusDefault),
  label: '导航组',
  description: '图标或图片导航，支持排列、宫格与列表三种展示',
  Panel({ value, onChange, ctx }) {
    const f = bindDiyPanel(value, onChange, ctx.disabled);
    const layout = Number(value.menuStyleConfig?.tabVal ?? 0);
    const paged = Number(value.showConfig?.tabVal ?? 0) !== 0;
    const header = Boolean((value.headerConfig as { enable?: unknown } | undefined)?.enable);
    const customTone = Number(value.toneConfig?.tabVal ?? 0) !== 0;
    const iconMode =
      Number((value.menuConfig as { listStyle?: unknown } | undefined)?.listStyle ?? 0) === 1;
    const iconStyle = value.iconStyleConfig as DiyIconStyleValue | undefined;

    return (
      <>
        <DiyTabsField {...f.bind('menuStyleConfig')} label="展示样式" variant="select" />
        <DiySetUpTabs value={f.tab} onChange={f.setTab} disabled={ctx.disabled} />

        <DiySection title={value.titleLeft ?? '展示设置'} when={f.tab === 0}>
          <DiyTabsField {...f.bind('navDisplayStyle')} />
          <DiyTabsField {...f.bind('showConfig')} />
          {layout === 0 ? <DiyTabsField {...f.bind('number')} /> : null}
          {layout === 1 ? <DiyTabsField {...f.bind('gridStyle')} /> : null}
          <DiyEnableField {...f.bind('headerConfig')} />
          {header ? (
            <>
              <DiyTextConfigField {...f.bind('leftTopText')} />
              <DiyTextConfigField {...f.bind('rightTopText')} />
            </>
          ) : null}
          {paged ? <DiyTabsField {...f.bind('rowsNum')} /> : null}
        </DiySection>

        <DiySection title={value.titleContent ?? '内容设置'} when={f.tab === 0}>
          <DiyMenuListField {...f.bind('menuConfig')} />
        </DiySection>

        <DiySection title="头部样式" when={f.tab === 1 && header}>
          <DiyHeaderStyleField {...f.bind('headerStyle')} />
        </DiySection>

        <DiySection
          title={(value.gridItemStyle as { title?: string } | undefined)?.title ?? '宫格项样式'}
          when={f.tab === 1 && layout === 1}
        >
          <DiyGridItemStyleField {...f.bind('gridItemStyle')} />
        </DiySection>

        <DiySection title={value.titleRight ?? '图片样式'} when={f.tab === 1}>
          <DiyFilletField {...f.bind('filletImg')} />
        </DiySection>

        <DiySection title="图标样式" when={f.tab === 1 && iconMode && iconStyle !== undefined}>
          <DiyIconStyleField
            value={iconStyle}
            onChange={(next) => f.patch({ iconStyleConfig: next })}
            disabled={ctx.disabled}
          />
        </DiySection>

        <DiySection title={value.titlePointer ?? '指示器设置'} when={f.tab === 1 && paged}>
          <DiyTabsField {...f.bind('toneConfig')} />
          {customTone ? (
            <>
              <DiyColourField {...f.bind('pointerColor')} />
              <DiyColourField {...f.bind('pointerBgColor')} />
            </>
          ) : null}
        </DiySection>

        <DiyCommonStyleSection
          value={value}
          onChange={onChange}
          disabled={ctx.disabled}
          when={f.tab === 1}
        />
      </>
    );
  },
});
