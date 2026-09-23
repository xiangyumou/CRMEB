import { z } from 'zod';

import { blockProps, imageUrl } from '../base';
import { ORDER_ENTRY_KEYS, type OrderEntryKey } from '../constants';
import { linkTarget } from '../link';
import { ui } from '../meta';
import { defineBlock } from '../registry';

/**
 * The 个人中心 blocks (plan §2.2): 用户卡片, 订单入口, 服务宫格.
 *
 * Their props are configuration only. The shopper's own data — nickname,
 * avatar, order counts — is not page data: the 我的 page reads it from
 * `user.getProfile` and `order.counts` and hands it to the blocks, so the
 * cached page stays free of anything personal.
 *
 * Schema only for now: the components are stream G's. They exist here because
 * the built-in 个人中心 (`defaults.ts`) is made of them.
 */

export const userCardProps = blockProps({
  background: imageUrl.optional().meta(ui({ label: '背景图', field: 'image', group: '内容' })),
  /** 优惠券 / 收藏 / 足迹 counters under the name. */
  showStats: z
    .boolean()
    .default(true)
    .meta(ui({ label: '显示券、收藏、足迹数量', group: '内容' })),
});
export type UserCardProps = z.infer<typeof userCardProps>;

export const userCardBlock = defineBlock({
  type: 'userCard',
  v: 1,
  props: userCardProps,
  meta: { label: '用户卡片', pages: ['user_center'], maxPerPage: 1 },
});

const orderEntryKey = z.enum(Object.keys(ORDER_ENTRY_KEYS) as [OrderEntryKey, ...OrderEntryKey[]]);

export const orderEntryItem = z.object({
  key: orderEntryKey.meta(ui({ label: '入口', options: ORDER_ENTRY_KEYS })),
  label: z
    .string()
    .min(1)
    .max(6)
    .meta(ui({ label: '文字' })),
  icon: imageUrl.optional().meta(ui({ label: '图标（不选用默认）', field: 'image' })),
});
export type OrderEntryItem = z.infer<typeof orderEntryItem>;

export const orderEntryProps = blockProps({
  title: z
    .string()
    .min(1)
    .max(10)
    .default('我的订单')
    .meta(ui({ label: '标题', group: '内容' })),
  items: z
    .array(orderEntryItem)
    .min(1)
    .max(5)
    .default([
      { key: 'unpaid', label: '待付款' },
      { key: 'unshipped', label: '待发货' },
      { key: 'unreceived', label: '待收货' },
      { key: 'unreviewed', label: '待评价' },
      { key: 'aftersale', label: '售后/退款' },
    ])
    .meta(ui({ label: '入口', field: 'array', itemLabel: 'label', group: '内容' })),
});
export type OrderEntryProps = z.infer<typeof orderEntryProps>;

export const orderEntryBlock = defineBlock({
  type: 'orderEntry',
  v: 1,
  props: orderEntryProps,
  meta: { label: '订单入口', pages: ['user_center'], maxPerPage: 1 },
});

export const serviceGridItem = z.object({
  label: z
    .string()
    .min(1)
    .max(8)
    .meta(ui({ label: '文字' })),
  icon: imageUrl.optional().meta(ui({ label: '图标（不选用默认）', field: 'image' })),
  link: linkTarget.meta(ui({ label: '跳转链接', field: 'link' })),
});
export type ServiceGridItem = z.infer<typeof serviceGridItem>;

export const serviceGridProps = blockProps({
  title: z
    .string()
    .max(10)
    .default('我的服务')
    .meta(ui({ label: '标题（留空不显示）', group: '内容' })),
  columns: z
    .union([z.literal(4), z.literal(5)])
    .default(4)
    .meta(
      ui({ label: '每行个数', field: 'radio', options: { 4: '4 个', 5: '5 个' }, group: '内容' }),
    ),
  items: z
    .array(serviceGridItem)
    .min(1)
    .max(20)
    .meta(ui({ label: '服务', field: 'array', itemLabel: 'label', group: '内容' })),
});
export type ServiceGridProps = z.infer<typeof serviceGridProps>;

export const serviceGridBlock = defineBlock({
  type: 'serviceGrid',
  v: 1,
  props: serviceGridProps,
  meta: { label: '服务宫格', pages: ['user_center', 'custom'] },
});
