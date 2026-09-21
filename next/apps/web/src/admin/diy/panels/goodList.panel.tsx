'use client';

import { goodListSchema, type GoodListComponent } from '@shop/contracts/diy/schema/goodList.schema';
import { Checkbox } from 'antd';

import { goodListDefault } from '../defaults/goodList.default';
import {
  DiyCategoryPickerField,
  DiyColourField,
  DiyFieldRow,
  DiyFilletField,
  DiyProductPickerField,
  DiySection,
  DiySetUpTabs,
  DiySelectField,
  DiySliderField,
  DiySpacingField,
  DiyTabsField,
} from '../fields';
import { bindDiyPanel, defineDiyPanel } from '../panel-api';

/**
 * 商品列表 — the reference panel for "a component that picks records".
 *
 * Ports `c_home_goods_list.vue`. Two things are worth copying into the other
 * ~15 product-ish panels:
 *
 * - `typeConfig.activeValue` is `1` for 指定商品 and `3` for 筛选商品; the
 *   product picker and the category/number/sort trio are mutually exclusive.
 * - `checkboxInfo` is the odd one out among the field editors: its selection
 *   lives in `type` as an **array of ids**, while `list` holds the labels.
 */
export default defineDiyPanel<GoodListComponent>({
  key: 'goodList',
  schema: goodListSchema,
  createDefault: () => structuredClone(goodListDefault),
  label: '商品列表',
  description: '按指定商品或筛选条件展示商品',
  Panel({ value, onChange, ctx }) {
    const f = bindDiyPanel(value, onChange, ctx.disabled);
    const picksExplicitly = Number(value.typeConfig?.activeValue ?? 1) === 1;
    const customTone = Number(value.toneConfig?.tabVal ?? 0) === 1;
    const customCartTone = Number(value.toneCartConfig?.tabVal ?? 0) === 1;
    const showsCart = Number(value.cartConfig?.tabVal ?? 0) === 0;

    const checkbox = value.checkboxInfo ?? {};
    const selected = (Array.isArray(checkbox.type) ? checkbox.type : []) as (string | number)[];
    const options = ((checkbox.list ?? []) as { id?: string | number; name?: string }[]).map(
      (item) => ({ label: item.name ?? String(item.id), value: item.id as string | number }),
    );

    return (
      <>
        <DiyTabsField {...f.bind('styleConfig')} label="选择风格" variant="select" />
        <DiySetUpTabs value={f.tab} onChange={f.setTab} disabled={ctx.disabled} />

        <DiySection title={value.titleLeft ?? '列表设置'} when={f.tab === 0}>
          <DiySelectField {...f.bind('typeConfig')} />
          {picksExplicitly ? (
            <DiyProductPickerField {...f.bind('goodsList')} label="选择商品" max={20} />
          ) : (
            <>
              <DiyCategoryPickerField
                value={{ title: '商品分类', activeValue: value.classList?.classVal }}
                onChange={(next) =>
                  f.patch({
                    classList: { ...(value.classList ?? {}), classVal: next.activeValue },
                  })
                }
                disabled={ctx.disabled}
                multiple
              />
              <DiyTabsField {...f.bind('goodsSort')} />
              <DiySliderField {...f.bind('numberConfig')} max={50} />
            </>
          )}
        </DiySection>

        <DiySection title={value.titleContents ?? '显示内容'} when={f.tab === 0}>
          <DiyFieldRow label={checkbox.title ?? '展示信息'} stacked>
            <Checkbox.Group
              disabled={ctx.disabled}
              value={selected}
              options={options}
              onChange={(next) => f.patch({ checkboxInfo: { ...checkbox, type: next } })}
            />
          </DiyFieldRow>
        </DiySection>

        <DiySection title={value.titleCart ?? '购物车按钮'} when={f.tab === 0}>
          <DiyTabsField {...f.bind('cartConfig')} />
          {showsCart ? <DiyTabsField {...f.bind('bntConfig')} /> : null}
        </DiySection>

        <DiySection title={value.titleRight ?? '商品样式'} when={f.tab === 1}>
          <DiyTabsField {...f.bind('goodsName')} />
          <DiyFilletField {...f.bind('filletImg')} />
          <DiyTabsField {...f.bind('toneConfig')} />
          {customTone ? (
            <>
              <DiyColourField {...f.bind('goodsNameColor')} />
              <DiyColourField {...f.bind('goodsPriceColor')} />
              <DiyColourField {...f.bind('soldNumColor')} />
              <DiyColourField {...f.bind('scoreColor')} />
            </>
          ) : null}
          {showsCart ? (
            <>
              <DiyTabsField {...f.bind('toneCartConfig')} label="按钮色调" />
              {customCartTone ? <DiyColourField {...f.bind('bntBgColor')} stops={2} /> : null}
            </>
          ) : null}
        </DiySection>

        <DiySection title={value.titleCurrency ?? '通用样式'} when={f.tab === 1}>
          <DiyColourField {...f.bind('moduleColor')} stops={2} />
          <DiyColourField {...f.bind('bottomBgColor')} />
          <DiySpacingField {...f.bind('paddingConfig')} />
          <DiySpacingField {...f.bind('marginConfig')} />
          <DiyFilletField {...f.bind('fillet')} />
        </DiySection>
      </>
    );
  },
});
