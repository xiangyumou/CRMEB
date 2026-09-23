import { z } from 'zod';
import { defineConfigGroup } from '../kernel/config-registry';

/**
 * 拼团设置.
 *
 * `virtualFillOnExpiry` is the shop's answer to "do we invent buyers when a
 * team does not fill". It is shop-wide rather than per activity on purpose: a
 * campaign-level toggle would let anyone who can edit an activity fake teams
 * without holding the `groupbuy:group:complete` permission.
 *
 * The group declares the *read* atom, as every config group does; the settings
 * service derives the write gate from it (`writePermissionFor`), so seeing this
 * form needs `groupbuy:activity:read` and saving it needs
 * `groupbuy:activity:write`. "May we fake teams" is not a setting a 运营
 * assistant should be able to flip.
 */
export const groupbuyConfig = defineConfigGroup({
  group: 'groupbuy',
  title: '拼团设置',
  permission: 'groupbuy:activity:read',
  schema: z.object({
    /** May the expiry sweep complete an under-filled team by inventing members? */
    virtualFillOnExpiry: z.boolean().default(false),
    /** Groups one sweep pass handles. The per-group delayed job does the real work. */
    groupExpirySweepLimit: z.number().int().min(1).max(2_000).default(200),
    /**
     * The storefront path a poster's QR code points at. `{groupId}` is
     * substituted. Held as config because the uni-app route is the client's to
     * decide and changes with its releases.
     */
    posterPage: z
      .string()
      .min(1)
      .max(255)
      .default('/pages/activity/groupbuy/detail?groupId={groupId}'),
    /**
     * The 拼团频道 head images. Config rather than a table because there are
     * two of them; a DIY page that wants richer banners uses the DIY components
     * instead.
     */
    banners: z
      .array(z.object({ imageUrl: z.string().max(512), link: z.string().max(255).nullable() }))
      .max(10)
      .default([]),
  }),
  ui: {
    virtualFillOnExpiry: {
      label: '到期自动虚拟成团',
      type: 'switch',
      help: '开启后，拼团到期未满员时由系统补足虚拟成员并成团；关闭则拼团失败并自动退款',
      section: '成团',
    },
    groupExpirySweepLimit: {
      label: '过期拼团每次清理数量',
      type: 'number',
      help: '兜底扫描每次处理的拼团数，正常情况下由单个延时任务先行结算',
      section: '成团',
    },
    posterPage: {
      label: '拼团海报跳转地址',
      type: 'text',
      help: '小程序/H5 扫码后跳转的页面路径，{groupId} 会被替换为拼团 ID',
      section: '分享',
    },
    banners: {
      label: '拼团频道头图',
      type: 'json',
      help: '形如 [{"imageUrl":"https://…","link":null}]，link 为空表示不跳转',
      section: '分享',
    },
  },
});

export type GroupbuyConfig = z.infer<typeof groupbuyConfig.schema>;
