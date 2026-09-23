import { z } from 'zod';

import { ui } from './meta';

/**
 * Shapes every block shares. DRAFT — moves to `@shop/contracts` in stream F1.
 */

/** An image the storefront can load: an uploaded asset URL (or a data URI in fixtures). */
export const imageUrl = z
  .string()
  .min(1, '请选择图片')
  .max(2048)
  .refine((value) => /^(https?:\/\/|\/|data:image\/)/.test(value), '图片地址无效')
  .meta(ui({ label: '图片', field: 'image' }));

/** `#rgb` / `#rrggbb` / `#rrggbbaa`. */
export const color = z
  .string()
  .regex(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i, '颜色格式应为 #RRGGBB')
  .meta(ui({ label: '颜色', field: 'color' }));

/** Money as the API sends it: `"12.00"`. */
export const money = z.string().regex(/^\d+\.\d{2}$/);

export const SPACING = { none: '无', sm: '小', md: '中', lg: '大' } as const;
export const RADIUS = { none: '直角', sm: '小圆角', lg: '大圆角' } as const;

/**
 * The base every block has (plan §2.1): spacing from preset steps, a
 * background and a corner radius. Presets rather than free numbers, so a
 * theme can retune the steps in one place.
 */
export const blockStyle = z
  .object({
    marginY: z
      .enum(['none', 'sm', 'md', 'lg'])
      .default('none')
      .meta(ui({ label: '上下间距', field: 'radio', options: SPACING })),
    paddingX: z
      .enum(['none', 'sm', 'md', 'lg'])
      .default('none')
      .meta(ui({ label: '左右留白', field: 'radio', options: SPACING })),
    radius: z
      .enum(['none', 'sm', 'lg'])
      .default('none')
      .meta(ui({ label: '圆角', field: 'radio', options: RADIUS })),
    background: color.optional().meta(ui({ label: '背景色', field: 'color' })),
  })
  .meta(ui({ label: '样式', field: 'object', group: '样式' }));

export type BlockStyle = z.infer<typeof blockStyle>;

export const blockStyleDefaults: BlockStyle = blockStyle.parse({});

/**
 * A product as a block receives it: resolved by the server from the block's
 * data source (plan §2.1), never fetched by the block.
 */
export const productSummary = z.object({
  id: z.string(),
  title: z.string(),
  image: z.string(),
  price: money,
  /** Struck-through reference price. */
  marketPrice: money.optional(),
  /** Short badge, e.g. 新品 / 热卖. */
  tag: z.string().max(4).optional(),
});

export type ProductSummary = z.infer<typeof productSummary>;
