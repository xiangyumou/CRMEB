'use client';

import {
  customComponentSchema,
  type CustomComponentComponent,
} from '@shop/contracts/diy/schema/customComponent.schema';
import { Typography } from 'antd';

import { customComponentDefault } from '../defaults/customComponent.default';
import {
  DiyCategoryPickerField,
  DiyCommonStyleSection,
  DiyDataStyleSection,
  DiyDateRangeField,
  DiyNumberField,
  DiyRecordPickerField,
  DiySection,
  DiySelectField,
  DiySetUpTabs,
  DiyTabsField,
} from '../fields';
import { bindDiyPanel, defineDiyPanel } from '../panel-api';

/**
 * 超级组件, the only panel whose row set is
 * chosen by a **select** rather than a tab strip: `selectType.activeValue` is
 * one of `user` / `article` / `coupon` / `goods`, and each names a whole
 * 数据设置 block. `user` has none — it is the default and shows nothing between
 * 信息设置 and 组件设计, which is not a bug: 会员用户 has no data settings.
 *
 * Opening a node never writes to it. Some stored pages carry the whole
 * `…DataConfig` family and some do not; the 数据样式 block draws whatever the
 * node has. `customComponent.default.ts` carries the family, so a fresh
 * 超级组件 has every row. 显示数量 is drawn once for the filtered article
 * branch.
 *
 * `customBtnConfig` names an inner-layout designer (the stored
 * `customComponents`). This editor has no such designer — it would be a
 * page-sized surface of its own — so the stored `customComponents` value is
 * carried through untouched.
 *
 * `couponNum` is not an operator setting and gets no control.
 */
export default defineDiyPanel<CustomComponentComponent>({
  key: 'customComponent',
  schema: customComponentSchema,
  createDefault: () => structuredClone(customComponentDefault),
  label: '超级组件',
  description: '一块自定义布局，可绑定用户、文章、优惠券或商品数据',
  Panel({ value, onChange, ctx }) {
    const f = bindDiyPanel(value, onChange, ctx.disabled);
    const type = String(value.selectType?.activeValue ?? 'user');
    const picked = (key: 'articleDataSource' | 'couponDataSource' | 'goodsDataSource'): number =>
      Number(value[key]?.tabVal ?? 0);

    return (
      <>
        <DiySetUpTabs value={f.tab} onChange={f.setTab} disabled={ctx.disabled} />

        <DiySection title={value.messageTitle ?? '信息设置'} when={f.tab === 0}>
          <DiySelectField {...f.bind('selectType')} />
          {type === 'article' ? (
            <>
              <DiyTabsField {...f.bind('articleDisplayMode')} />
              <DiyTabsField {...f.bind('articleColumnStyle')} />
            </>
          ) : null}
          {type === 'coupon' ? (
            <>
              <DiyTabsField {...f.bind('couponDisplayMode')} />
              <DiyTabsField {...f.bind('couponColumnStyle')} />
            </>
          ) : null}
          {type === 'goods' ? (
            <>
              <DiyTabsField {...f.bind('goodsDisplayMode')} />
              <DiyTabsField {...f.bind('goodsColumnStyle')} />
            </>
          ) : null}
        </DiySection>

        <DiySection title={value.dataTitle ?? '数据设置'} when={f.tab === 0 && type === 'article'}>
          <DiyTabsField {...f.bind('articleDataSource')} />
          {picked('articleDataSource') === 0 ? (
            <DiyRecordPickerField {...f.bind('articleList')} kind="article" label="文章列表" />
          ) : (
            <>
              <DiyCategoryPickerField
                value={value.articleClass}
                onChange={(next) =>
                  f.patch({
                    articleClass: {
                      ...(value.articleClass ?? {}),
                      activeValue: next.activeValue as never,
                    },
                  })
                }
                disabled={ctx.disabled}
                kind="article"
              />
              <DiyNumberField {...f.bind('articleNum')} />
              <DiyTabsField {...f.bind('articleSort')} />
              <DiyTabsField {...f.bind('articleSortRule')} />
            </>
          )}
        </DiySection>

        <DiySection title={value.dataTitle ?? '数据设置'} when={f.tab === 0 && type === 'coupon'}>
          <DiyTabsField {...f.bind('couponDataSource')} />
          {picked('couponDataSource') === 0 ? (
            <DiyRecordPickerField {...f.bind('couponList')} kind="coupon" label="优惠券" />
          ) : (
            <>
              <DiySelectField {...f.bind('couponType')} />
              <DiySelectField {...f.bind('couponUserType')} />
              {/* 会员用户 has no 发送方式 — a `!=` against the string '2'. */}
              {String(value.couponUserType?.activeValue ?? '') !== '2' ? (
                <DiySelectField {...f.bind('couponSendType')} />
              ) : null}
              <DiyTabsField {...f.bind('couponThreshold')} />
              {Number(value.couponThreshold?.tabVal ?? 0) === 1 ? (
                <DiyNumberField {...f.bind('couponThresholdValue')} />
              ) : null}
              <DiyDateRangeField {...f.bind('couponTime')} />
              <DiyTabsField {...f.bind('couponSort')} />
              <DiyTabsField {...f.bind('couponSortRule')} />
            </>
          )}
        </DiySection>

        <DiySection title={value.dataTitle ?? '数据设置'} when={f.tab === 0 && type === 'goods'}>
          <DiyTabsField {...f.bind('goodsDataSource')} />
          {picked('goodsDataSource') === 0 ? (
            <DiyRecordPickerField {...f.bind('goodsList')} kind="product" max={20} />
          ) : (
            <>
              <DiyCategoryPickerField
                value={value.goodsClass}
                onChange={(next) =>
                  f.patch({
                    goodsClass: {
                      ...(value.goodsClass ?? {}),
                      activeValue: next.activeValue as never,
                    },
                  })
                }
                disabled={ctx.disabled}
                kind="product"
              />
              <DiyTabsField {...f.bind('goodsSort')} />
              <DiyTabsField {...f.bind('goodsSortRule')} />
              <DiyNumberField {...f.bind('goodsNum')} />
            </>
          )}
        </DiySection>

        <DiySection title={value.designTitle ?? '组件设计'} when={f.tab === 0}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            组件内部布局由独立的设计器编辑，本版本暂未提供；已保存的设计会原样保留。
          </Typography.Text>
        </DiySection>

        <DiyDataStyleSection
          value={value}
          onChange={onChange}
          disabled={ctx.disabled}
          when={f.tab === 1}
        />

        <DiyCommonStyleSection
          value={value}
          onChange={onChange}
          disabled={ctx.disabled}
          title={value.commonTitle}
          when={f.tab === 1}
        />
      </>
    );
  },
});
