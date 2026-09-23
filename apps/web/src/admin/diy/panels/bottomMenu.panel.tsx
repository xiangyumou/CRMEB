'use client';

import {
  bottomMenuSchema,
  type BottomMenuComponent,
} from '@shop/contracts/diy/schema/bottomMenu.schema';

import { bottomMenuDefault } from '../defaults/bottomMenu.default';
import {
  DiyCheckboxField,
  DiyColourField,
  DiyCommonStyleSection,
  DiyFilletField,
  DiyMenuListField,
  DiySection,
  DiySetUpTabs,
  DiySliderField,
  DiyTabsField,
} from '../fields';
import { bindDiyPanel, defineDiyPanel } from '../panel-api';

/**
 * 底部菜单, the商品详情 footer bar. A singleton: the
 * page has one and it cannot be dropped twice.
 *
 * Three indices:
 *
 * - `entryConfig.tabVal` — `0` 默认 shows the fixed 首页/收藏/客服 set through
 *   `showContent`; `1` 自定义 replaces it with `menuConfig`'s own rows.
 * - `menuConfig.listStyle` — inside 自定义, `0` 图片 gives the rows a radius
 *   (`menuPcFillet`) and `1` 图标 gives them a colour, a size and a rotation.
 * - `toneConfig.tabVal` — `1` 自定义 unlocks the two button colours.
 *
 * `padding` is in the default but is not an operator setting; the padding an
 * operator edits is `c_common_style`'s `paddingConfig`. Left untouched.
 */
export default defineDiyPanel<BottomMenuComponent>({
  key: 'bottomMenu',
  schema: bottomMenuSchema,
  createDefault: () => structuredClone(bottomMenuDefault),
  label: '底部菜单',
  description: '商品详情底部的入口与购买按钮',
  Panel({ value, onChange, ctx }) {
    const f = bindDiyPanel(value, onChange, ctx.disabled);
    const custom = Number(value.entryConfig?.tabVal ?? 0) === 1;
    const asImages = Number(value.menuConfig?.listStyle ?? 0) === 0;
    const customTone = Number(value.toneConfig?.tabVal ?? 0) === 1;

    return (
      <>
        <DiySetUpTabs value={f.tab} onChange={f.setTab} disabled={ctx.disabled} />

        <DiySection title={value.contentConfigTitle ?? '内容设置'} when={f.tab === 0}>
          <DiyTabsField {...f.bind('entryConfig')} />
          {custom ? (
            <DiyMenuListField {...f.bind('menuConfig')} />
          ) : (
            <DiyCheckboxField {...f.bind('showContent')} />
          )}
          <DiyTabsField {...f.bind('cartButton')} />
        </DiySection>

        <DiySection title={value.styleTitle ?? '样式设置'} when={f.tab === 1 && custom}>
          {asImages ? (
            <DiyFilletField {...f.bind('menuPcFillet')} />
          ) : (
            <>
              <DiyColourField {...f.bind('iconColor')} />
              <DiySliderField {...f.bind('iconSize')} min={10} max={50} />
              <DiySliderField {...f.bind('iconRotate')} min={0} max={360} />
            </>
          )}
        </DiySection>

        <DiySection title={value.buttonStyleTitle ?? '按钮设置'} when={f.tab === 1}>
          <DiyTabsField {...f.bind('toneConfig')} />
          {customTone ? (
            <>
              <DiyColourField {...f.bind('cartColor')} />
              <DiyColourField {...f.bind('buyColor')} />
            </>
          ) : null}
        </DiySection>

        <DiyCommonStyleSection
          value={value}
          onChange={onChange}
          disabled={ctx.disabled}
          title={value.generalStyleTitle}
          when={f.tab === 1}
        />
      </>
    );
  },
});
