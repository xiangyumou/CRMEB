import type { ComponentType, ReactNode } from 'react';

import type { LinkTarget } from '@shop/contracts/decor/link';
import type { BlockType } from '../schema';
import { Carousel } from './carousel/carousel';
import { HotspotImage } from './hotspot-image/hotspot-image';
import { ImageCube } from './image-cube/image-cube';
import { NavGrid } from './nav-grid/nav-grid';
import { Notice } from './notice/notice';
import { OrderEntry } from './order-entry/order-entry';
import { ProductGrid } from './product-grid/product-grid';
import { ProductTabs } from './product-tabs/product-tabs';
import { RichText } from './rich-text/rich-text';
import { SearchBar } from './search-bar/search-bar';
import { ServiceGrid } from './service-grid/service-grid';
import type { PersonalSlots } from './shared/personal';
import type { BlockIntent, BlockProps } from './shared/types';
import { Spacer } from './spacer/spacer';
import { TitleBar } from './title-bar/title-bar';
import { UserCard } from './user-card/user-card';

export { Carousel } from './carousel/carousel';
export { HotspotImage } from './hotspot-image/hotspot-image';
export { ImageCube } from './image-cube/image-cube';
export { NavGrid } from './nav-grid/nav-grid';
export { Notice } from './notice/notice';
export { OrderEntry, orderEntryLink } from './order-entry/order-entry';
export { ProductCards, type ProductCardsProps } from './product-grid/product-cards';
export { ProductGrid, type ProductGridData } from './product-grid/product-grid';
export { ProductTabs, type ProductTabsData } from './product-tabs/product-tabs';
export { RichText } from './rich-text/rich-text';
export { SearchBar } from './search-bar/search-bar';
export { ServiceGrid } from './service-grid/service-grid';
export { Spacer } from './spacer/spacer';
export { TitleBar } from './title-bar/title-bar';
export { UserCard } from './user-card/user-card';
export { BlockFrame } from './shared/frame';
export type { PersonalSlots } from './shared/personal';
export type { BlockIntent, BlockProps } from './shared/types';

/**
 * Block type → component. A `Record` over `BlockType` (every registered
 * type), so a block added to the contracts registry does not compile until it
 * has a component.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each entry has its own props type
export const BLOCK_COMPONENTS: Record<BlockType, ComponentType<BlockProps<any, any, any>>> = {
  searchBar: SearchBar,
  carousel: Carousel,
  navGrid: NavGrid,
  notice: Notice,
  imageCube: ImageCube,
  hotspotImage: HotspotImage,
  titleBar: TitleBar,
  productGrid: ProductGrid,
  productTabs: ProductTabs,
  richText: RichText,
  spacer: Spacer,
  userCard: UserCard,
  orderEntry: OrderEntry,
  serviceGrid: ServiceGrid,
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
  /** The signed-in shopper's state, by block id (`ResolvedPage.personal`); absent for a guest. */
  personal?: Readonly<Record<string, PersonalSlots>> | null | undefined;
  onLink?: ((target: LinkTarget) => void) | undefined;
  onIntent?: ((intent: BlockIntent) => void) | undefined;
  renderIntent?: ((intent: BlockIntent, children: ReactNode) => ReactNode) | undefined;
}

/**
 * Renders a page's blocks in order. A type this build does not know is skipped,
 * not an error: an old mini-program keeps working when the admin gains a block
 * (plan §2.1, forward compatibility).
 */
export function BlockList({
  blocks,
  data,
  personal,
  onLink,
  onIntent,
  renderIntent,
}: BlockListProps) {
  return (
    <>
      {blocks.map((block) => {
        const Component = (
          BLOCK_COMPONENTS as Record<string, (typeof BLOCK_COMPONENTS)[BlockType]>
        )[block.type];
        if (!Component) return null;
        return (
          <Component
            key={block.id}
            props={block.props}
            data={data?.[block.id]}
            personal={personal?.[block.id]}
            onLink={onLink}
            onIntent={onIntent}
            renderIntent={renderIntent}
          />
        );
      })}
    </>
  );
}
