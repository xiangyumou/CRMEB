import type { z } from 'zod';

import { createBlockRegistry, type AnyBlockDefinition } from './registry';
import { carouselBlock } from './blocks/carousel';
import { hotspotImageBlock } from './blocks/hotspot-image';
import { imageCubeBlock } from './blocks/image-cube';
import { navGridBlock } from './blocks/nav-grid';
import { noticeBlock } from './blocks/notice';
import { productGridBlock } from './blocks/product-grid';
import { productTabsBlock } from './blocks/product-tabs';
import { richTextBlock } from './blocks/rich-text';
import { searchBarBlock } from './blocks/search-bar';
import { spacerBlock } from './blocks/spacer';
import { titleBarBlock } from './blocks/title-bar';
import { orderEntryBlock, serviceGridBlock, userCardBlock } from './blocks/user-center';

export * from './blocks/carousel';
export * from './blocks/hotspot-image';
export * from './blocks/image-cube';
export * from './blocks/nav-grid';
export * from './blocks/notice';
export * from './blocks/product-grid';
export * from './blocks/product-tabs';
export * from './blocks/rich-text';
export * from './blocks/search-bar';
export * from './blocks/spacer';
export * from './blocks/title-bar';
export * from './blocks/user-center';

/**
 * Every block type this build knows, in palette order. Adding a block is one
 * `defineBlock` file plus a line here; the storefront component (stream G) and
 * the editor pick it up from the registry.
 */
export const DECOR_BLOCK_DEFINITIONS = [
  searchBarBlock,
  carouselBlock,
  navGridBlock,
  noticeBlock,
  imageCubeBlock,
  hotspotImageBlock,
  titleBarBlock,
  productGridBlock,
  productTabsBlock,
  richTextBlock,
  spacerBlock,
  userCardBlock,
  orderEntryBlock,
  serviceGridBlock,
] as const satisfies readonly AnyBlockDefinition[];

export type DecorBlockDefinition = (typeof DECOR_BLOCK_DEFINITIONS)[number];
export type DecorBlockType = DecorBlockDefinition['type'];

/** Props of a registered block type, parsed (defaults filled in). */
export type DecorBlockProps<T extends DecorBlockType> = z.infer<
  Extract<DecorBlockDefinition, { type: T }>['props']
>;

export const decorBlocks = createBlockRegistry(DECOR_BLOCK_DEFINITIONS);
