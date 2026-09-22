'use client';

import { InputNumber, Space, Switch, Typography } from 'antd';
import type {
  GroupbuyActivityForm,
  GroupbuyActivitySkuInput,
  GroupbuyActivityStatus,
  GroupbuyGroupStatus,
  GroupbuyMemberRole,
  GroupbuyMemberStatus,
} from '@shop/contracts/groupbuy/schemas';

import { MoneyInput } from '@/admin/kit/form/money-input';
import type { SortableItemHelpers } from '@/admin/kit/form/sortable-list-field';
import type { FieldSpec } from '@/admin/kit/form/types';
import type { StatusMap } from '@/admin/kit/status-tag';

/**
 * The group-buy domain's enums and form fields, in one file next to the pages.
 *
 * One `StatusMap` per enum, shared by the table column, the filter bar and the
 * form, so a label can never say 进行中 in one place and 已启用 in another. The
 * keys are the contract's own union members, so deleting a value from the
 * contract is a compile error here rather than a blank tag in production.
 */

export const GROUPBUY_ACTIVITY_STATUS: StatusMap<GroupbuyActivityStatus> = {
  draft: { label: '草稿', color: 'default' },
  active: { label: '进行中', color: 'success' },
  paused: { label: '已暂停', color: 'warning' },
  ended: { label: '已结束', color: 'default' },
};

export const GROUPBUY_GROUP_STATUS: StatusMap<GroupbuyGroupStatus> = {
  forming: { label: '拼团中', color: 'processing' },
  succeeded: { label: '已成团', color: 'success' },
  failed: { label: '未成团', color: 'error' },
  cancelled: { label: '已取消', color: 'default' },
};

export const GROUPBUY_MEMBER_STATUS: StatusMap<GroupbuyMemberStatus> = {
  joined: { label: '参团中', color: 'processing' },
  refunded: { label: '已退款', color: 'warning' },
  cancelled: { label: '已取消', color: 'default' },
};

export const GROUPBUY_MEMBER_ROLE: StatusMap<GroupbuyMemberRole> = {
  leader: { label: '团长', color: 'gold' },
  member: { label: '团员', color: 'default' },
};

/** A `StatusMap` as `<Select>` options, so a filter can never drift from a tag. */
export const optionsOf = <K extends string>(map: StatusMap<K>) =>
  (Object.keys(map) as K[]).map((value) => ({ label: map[value].label, value }));

/**
 * One row of the 规格 editor.
 *
 * A group-buy SKU is a price and a stock ledger of its own, hanging off a
 * `product_skus.id`. There is no product picker in the kit yet, so the id is
 * typed in; the server refuses a SKU that does not belong to the chosen product
 * (`GROUPBUY_SKU_NOT_IN_ACTIVITY`) rather than trusting this form.
 */
function SkuRow(item: never, helpers: SortableItemHelpers<never>) {
  const sku = item as unknown as Partial<GroupbuyActivitySkuInput>;
  const set = (patch: Partial<GroupbuyActivitySkuInput>) =>
    helpers.set({ ...sku, ...patch } as unknown as never);

  return (
    <Space wrap size="middle">
      <Space size={4}>
        <Typography.Text type="secondary">规格 ID</Typography.Text>
        <InputNumber
          min={1}
          value={sku.skuId === undefined ? null : Number(sku.skuId)}
          disabled={helpers.disabled}
          onChange={(value) => set({ skuId: value === null ? '' : String(value) })}
        />
      </Space>
      <Space size={4}>
        <Typography.Text type="secondary">拼团价</Typography.Text>
        <MoneyInput
          value={sku.price ?? ''}
          disabled={helpers.disabled}
          onChange={(value) => set({ price: value ?? '' })}
        />
      </Space>
      <Space size={4}>
        <Typography.Text type="secondary">库存</Typography.Text>
        <InputNumber
          min={0}
          value={sku.stock ?? 0}
          disabled={helpers.disabled}
          onChange={(value) => set({ stock: value ?? 0 })}
        />
      </Space>
      <Space size={4}>
        <Typography.Text type="secondary">限量</Typography.Text>
        <InputNumber
          min={0}
          placeholder="不限"
          value={sku.quota ?? null}
          disabled={helpers.disabled}
          onChange={(value) => set(value === null ? { quota: undefined } : { quota: value })}
        />
      </Space>
      <Space size={4}>
        <Typography.Text type="secondary">启用</Typography.Text>
        <Switch
          checked={sku.isEnabled ?? true}
          disabled={helpers.disabled}
          onChange={(checked) => set({ isEnabled: checked })}
        />
      </Space>
    </Space>
  );
}

/**
 * The create/edit form.
 *
 * Every rule comes from `groupbuyActivityForm` — the window ordering, the
 * two-person minimum and the duplicate-SKU check, which mirror
 * `groupbuy_activities_window_ordered`, `groupbuy_activities_seats_required`
 * and `groupbuy_activity_skus_uq`. This list only says how each field is typed
 * in.
 *
 * 拼团有效时长 is typed in seconds, the unit the contract validates, rather
 * than in hours with a conversion: `ZodForm` runs `groupbuyActivityForm` in the
 * browser, so a converted field would fail its own `min(60)` before anything
 * had a chance to multiply it. The help text carries the arithmetic instead.
 */
export const groupbuyActivityFields: FieldSpec<Extract<keyof GroupbuyActivityForm, string>>[] = [
  {
    kind: 'number',
    name: 'productId',
    label: '商品 ID',
    span: 6,
    min: 1,
    help: '拼团挂在已有商品上；商品选择器待 A 流上线后替换',
  },
  { kind: 'text', name: 'title', label: '活动标题', span: 12, placeholder: '三人成团 · 坚果礼盒' },
  {
    kind: 'select',
    name: 'status',
    label: '状态',
    span: 6,
    options: optionsOf(GROUPBUY_ACTIVITY_STATUS),
    help: '草稿不会出现在拼团频道',
  },

  { kind: 'text', name: 'intro', label: '活动简介', span: 12, maxLength: 255 },
  { kind: 'asset', name: 'imageUrl', label: '推荐图', span: 6 },
  { kind: 'asset', name: 'sliderImages', label: '轮播图', span: 6, multiple: true, max: 10 },

  { kind: 'money', name: 'price', label: '拼团价', span: 6 },
  { kind: 'money', name: 'originalPrice', label: '划线价', span: 6 },
  { kind: 'money', name: 'cost', label: '成本价', span: 6, help: '仅用于统计，不对外显示' },
  { kind: 'number', name: 'sortOrder', label: '排序', span: 6, min: 0 },

  {
    kind: 'number',
    name: 'seatsRequired',
    label: '成团人数',
    span: 6,
    min: 2,
    max: 100,
    help: '至少 2 人；1 人的团会自己成团',
  },
  {
    kind: 'number',
    name: 'groupTtlSeconds',
    label: '拼团有效时长',
    span: 6,
    min: 60,
    max: 30 * 24 * 3600,
    addonAfter: '秒',
    help: '开团后多久未满员即失败退款；86400 = 24 小时',
  },
  { kind: 'number', name: 'stock', label: '活动库存', span: 6, min: 0 },
  {
    kind: 'number',
    name: 'totalQuota',
    label: '限购总量',
    span: 6,
    min: 0,
    help: '留空表示只受库存限制',
  },

  { kind: 'number', name: 'perOrderQuantity', label: '每单限购', span: 6, min: 1, max: 999 },
  { kind: 'date', name: 'startAt', label: '开始时间', span: 6, showTime: true },
  { kind: 'date', name: 'endAt', label: '结束时间', span: 6, showTime: true },
  {
    kind: 'number',
    name: 'shippingTemplateId',
    label: '运费模板 ID',
    span: 6,
    min: 1,
    help: '留空则跟随商品',
  },

  {
    kind: 'sortableList',
    name: 'skus',
    label: '规格拼团价',
    span: 24,
    addText: '添加规格',
    emptyText: '未配置规格时，全部规格都按上面的拼团价售卖',
    max: 200,
    newItem: () => ({ skuId: '', price: '', stock: 0, isEnabled: true }),
    renderItem: SkuRow,
  },
];
