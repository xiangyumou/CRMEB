import type { z } from 'zod';

import { createBlockRegistry, type AnyBlockDefinition } from './registry';
import { carouselBlock } from './blocks/carousel';
import { imageCubeBlock } from './blocks/image-cube';
import { productGridBlock } from './blocks/product-grid';
import { orderEntryBlock, serviceGridBlock, userCardBlock } from './blocks/user-center';

export * from './blocks/carousel';
export * from './blocks/image-cube';
export * from './blocks/product-grid';
export * from './blocks/user-center';

/**
 * Every block type this build knows, in palette order. Adding a block is one
 * `defineBlock` file plus a line here; the storefront component (stream G) and
 * the editor pick it up from the registry.
 */
export const DECOR_BLOCK_DEFINITIONS = [
  carouselBlock,
  imageCubeBlock,
  productGridBlock,
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
