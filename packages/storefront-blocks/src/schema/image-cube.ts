import { z } from 'zod';

import { blockStyle, imageUrl } from './common';
import { IMAGE_CUBE_LAYOUTS, type ImageCubeLayout } from './constants';
import { linkTarget } from './link';
import { ui } from './meta';

/** 图片魔方 — DRAFT, moves to `@shop/contracts` in stream F1. */

export const imageCubeCell = z.object({
  image: imageUrl,
  link: linkTarget.optional().meta(ui({ label: '跳转链接', field: 'link' })),
});

export const imageCubeProps = z.object({
  layout: z
    .enum(Object.keys(IMAGE_CUBE_LAYOUTS) as [ImageCubeLayout, ...ImageCubeLayout[]])
    .default('left1right2')
    .meta(
      ui({
        label: '布局',
        field: 'select',
        options: Object.fromEntries(
          Object.entries(IMAGE_CUBE_LAYOUTS).map(([key, value]) => [key, value.label]),
        ),
        group: '内容',
      }),
    ),
  /** Cells beyond what the layout shows are kept, so switching layouts back loses nothing. */
  cells: z
    .array(imageCubeCell)
    .min(1)
    .max(4)
    .meta(ui({ label: '图片', field: 'array', group: '内容' })),
  /** Height of the non-row layouts, in 750-design px. Row layouts keep each image's ratio. */
  height: z
    .number()
    .int()
    .min(100)
    .max(1000)
    .default(360)
    .meta(ui({ label: '高度（750 设计稿 px，仅组合布局）', step: 10, group: '内容' })),
  gap: z
    .number()
    .int()
    .min(0)
    .max(40)
    .default(10)
    .meta(ui({ label: '图片间距（750 设计稿 px）', group: '样式' })),
  style: blockStyle.prefault({}),
});

export type ImageCubeProps = z.infer<typeof imageCubeProps>;
