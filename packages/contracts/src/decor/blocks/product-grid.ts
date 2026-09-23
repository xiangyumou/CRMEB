import { z } from 'zod';

import { blockProps } from '../base';
import { ui } from '../meta';
import { defineBlock } from '../registry';
import { need, productSource } from '../sources';

/** 商品网格: two columns of product cards, from a declarative source. */
export const productGridProps = blockProps({
  source: productSource
    .default({ mode: 'manual', ids: [] })
    .meta(ui({ label: '商品来源', field: 'productSource', group: '内容' })),
  titleLines: z
    .union([z.literal(1), z.literal(2)])
    .default(2)
    .meta(
      ui({ label: '标题行数', field: 'radio', options: { 1: '一行', 2: '两行' }, group: '展示' }),
    ),
  showMarketPrice: z
    .boolean()
    .default(true)
    .meta(ui({ label: '显示划线价', group: '展示' })),
  showTag: z
    .boolean()
    .default(true)
    .meta(ui({ label: '显示角标', group: '展示' })),
});

export type ProductGridProps = z.infer<typeof productGridProps>;

export const productGridBlock = defineBlock({
  type: 'productGrid',
  v: 1,
  props: productGridProps,
  meta: { label: '商品网格', pages: ['home', 'custom', 'user_center'] },
  data: (props) => ({ products: need.products(props.source) }),
});
