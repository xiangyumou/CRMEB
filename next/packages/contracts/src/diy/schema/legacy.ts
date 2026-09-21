import { z } from 'zod';

import { diyPageValue } from './page';

/**
 * The `eb_diy` row as MySQL held it, and as the production exports in
 * `__fixtures__/prod-*.json` are shaped.
 *
 * This schema exists for two consumers and no others: the ETL mapper
 * (`packages/etl/src/mappers/diy.ts`) and the round-trip fixtures. Nothing in
 * the new system persists this shape. Note `value` is a union — the four
 * settings rows (`color_change`, `category`, `member`, …) store a bare number
 * there, not a page.
 */
export const legacyDiyRow = z.looseObject({
  id: z.number().int(),
  version: z.string().optional(),
  name: z.string(),
  template_name: z.string(),
  value: z.union([diyPageValue, z.number(), z.string(), z.null()]),
  default_value: z.union([diyPageValue, z.number(), z.string(), z.null()]),
  add_time: z.number().int().optional(),
  update_time: z.number().int().optional(),
  /** 1 = this is the page the storefront serves. */
  status: z.number().int(),
  /** Legacy surface discriminator; see `LEGACY_TEMPLATE_KIND`. */
  type: z.number().int(),
  is_show: z.number().int().optional(),
  is_bg_color: z.number().int().optional(),
  is_bg_pic: z.number().int().optional(),
  color_picker: z.string().optional(),
  bg_pic: z.string().optional(),
  bg_tab_val: z.number().int().optional(),
  is_del: z.number().int(),
  order_status: z.number().int().optional(),
  my_banner_status: z.number().int().optional(),
  my_menus_status: z.number().int().optional(),
  business_status: z.number().int().optional(),
  /** 0 = a pre-visual-editor row whose `value` is keyed by component name. */
  is_diy: z.number().int(),
  title: z.string(),
  is_pro: z.number().int().optional(),
});
export type LegacyDiyRow = z.infer<typeof legacyDiyRow>;

/**
 * `eb_diy.template_name` → the surface the row decorates. Rows with an empty
 * `template_name` and `is_diy = 1` are visual-editor pages; `type` then says
 * whether it is the home page (1) or a 专题页 (0).
 */
export const LEGACY_TEMPLATE_KIND = {
  color_change: 'theme-colour',
  category: 'category',
  member: 'user_center',
} as const;

/** `eb_diy.bg_tab_val` → `diyPageBackground.imageMode`. */
export const LEGACY_BG_MODE = ['full', 'repeat', 'fixed'] as const;
