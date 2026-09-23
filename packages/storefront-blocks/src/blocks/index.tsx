import type { ComponentType } from 'react';

import type { BlockType } from '../schema/document';
import type { LinkTarget } from '../schema/link';
import { Carousel } from './carousel/carousel';
import { ImageCube } from './image-cube/image-cube';
import { ProductGrid } from './product-grid/product-grid';
import type { BlockProps } from './shared/types';

export { Carousel } from './carousel/carousel';
export { ImageCube } from './image-cube/image-cube';
export { ProductGrid, type ProductGridData } from './product-grid/product-grid';
export { BlockFrame } from './shared/frame';
export type { BlockProps } from './shared/types';

/**
 * Block type → component. A `Record` over `BlockType`, so a block added to the
 * document registry does not compile until it has a component.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each entry has its own props type
export const BLOCK_COMPONENTS: Record<BlockType, ComponentType<BlockProps<any, any>>> = {
  carousel: Carousel,
  productGrid: ProductGrid,
  imageCube: ImageCube,
};

export interface RenderedBlock {
  id: string;
  type: string;
  props: unknown;
}

export interface BlockListProps {
  /** Blocks with parsed props, as the page resolver returns them. */
  blocks: readonly RenderedBlock[];
  /** Resolved data, by block id. */
  data?: Readonly<Record<string, unknown>> | undefined;
  onLink?: ((target: LinkTarget) => void) | undefined;
}

/**
 * Renders a page's blocks in order. A type this build does not know is skipped,
 * not an error: an old mini-program keeps working when the admin gains a block
 * (plan §2.1, forward compatibility).
 */
export function BlockList({ blocks, data, onLink }: BlockListProps) {
  return (
    <>
      {blocks.map((block) => {
        const Component = (
          BLOCK_COMPONENTS as Record<string, (typeof BLOCK_COMPONENTS)[BlockType]>
        )[block.type];
        if (!Component) return null;
        return (
          <Component key={block.id} props={block.props} data={data?.[block.id]} onLink={onLink} />
        );
      })}
    </>
  );
}
