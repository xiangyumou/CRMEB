import { z } from 'zod';
import { defineConfigGroup } from '../kernel/config-registry';

/**
 * `diy` — the two 版式 switches.
 *
 * 分类页 and 个人中心 are not decorated component-by-component the way the home
 * page is: the app ships two or three hand-written layouts for each and the
 * operator picks one. That pick is a setting, not a page, so it lives here
 * rather than in `diy_pages`.
 *
 * A number, not a boolean: `pages/goods_cate/goods_cate.vue` reads
 * `status == 2 || status == 3`, and the production fixtures carry `category: 1`
 * and `member: 2`. As a boolean, two of the three values would collapse into
 * one.
 */
export const diyConfig = defineConfigGroup({
  group: 'diy',
  title: '装修版式',
  /**
   * `diy:page:publish`, not `diy:page:read`.
   *
   * The generic settings screen derives its write atom from its read atom by
   * swapping `:read` for `:write`, and 装修 has no `page:write` — it splits the
   * verb into create / update / publish precisely because publishing is the
   * dangerous one. Flipping this switch changes what every shopper sees the
   * instant it is saved, which is the same act, so it takes the same atom and
   * `writePermissionFor` leaves it alone.
   */
  permission: 'diy:page:publish',
  schema: z.object({
    /** 分类页: 1 三级联动, 2/3 the two full-page grids. */
    categoryLayout: z.number().int().min(1).max(3).default(1),
    /** 个人中心: 1 the plain header, 2/3 the card headers. */
    userCenterLayout: z.number().int().min(1).max(3).default(1),
  }),
  ui: {
    categoryLayout: {
      label: '分类页版式',
      type: 'select',
      section: '版式',
      help: '前台「分类」页使用哪一套内置布局',
      options: [
        { label: '版式一', value: 1 },
        { label: '版式二', value: 2 },
        { label: '版式三', value: 3 },
      ],
      order: 1,
    },
    userCenterLayout: {
      label: '个人中心版式',
      type: 'select',
      section: '版式',
      help: '前台「我的」页使用哪一套内置布局',
      options: [
        { label: '版式一', value: 1 },
        { label: '版式二', value: 2 },
        { label: '版式三', value: 3 },
      ],
      order: 2,
    },
  },
});
