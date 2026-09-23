import { View } from '@tarojs/components';
import { BlockList, type RenderedBlock } from '@shop/storefront-blocks';
import {
  fixtureCarousel,
  fixtureHotspotImage,
  fixtureImageCube,
  fixtureNavGrid,
  fixtureNotice,
  fixtureOrderEntry,
  fixtureProductGrid,
  fixtureProductTabs,
  fixtureProductTabsData,
  fixtureRichText,
  fixtureSearchBar,
  fixtureServiceGrid,
  fixtureSpacer,
  fixtureTitleBar,
  fixtureUserCard,
  resolveFixtureProducts,
} from '@shop/storefront-blocks/fixtures';

/**
 * Dev-only (spike S3, batch G1): every DIY v2 block from `@shop/storefront-blocks`,
 * on the same fixtures and in the same order as the admin editor's canvas
 * (`/admin/dev/decor-spike`), for the pixel comparison in
 * `packages/storefront-blocks/fidelity`. The background is the page document's
 * default (`#f5f5f5`), as in the canvas. The 个人中心 blocks show a guest, as the
 * canvas does.
 */
const BLOCKS: RenderedBlock[] = [
  { id: 'search-bar-1', type: 'searchBar', props: fixtureSearchBar },
  { id: 'carousel-1', type: 'carousel', props: fixtureCarousel },
  { id: 'nav-grid-1', type: 'navGrid', props: fixtureNavGrid },
  { id: 'notice-1', type: 'notice', props: fixtureNotice },
  { id: 'title-bar-1', type: 'titleBar', props: fixtureTitleBar },
  { id: 'product-grid-1', type: 'productGrid', props: fixtureProductGrid },
  { id: 'image-cube-1', type: 'imageCube', props: fixtureImageCube },
  { id: 'hotspot-image-1', type: 'hotspotImage', props: fixtureHotspotImage },
  { id: 'product-tabs-1', type: 'productTabs', props: fixtureProductTabs },
  { id: 'spacer-1', type: 'spacer', props: fixtureSpacer },
  { id: 'rich-text-1', type: 'richText', props: fixtureRichText },
  { id: 'user-card-1', type: 'userCard', props: fixtureUserCard },
  { id: 'order-entry-1', type: 'orderEntry', props: fixtureOrderEntry },
  { id: 'service-grid-1', type: 'serviceGrid', props: fixtureServiceGrid },
];

const DATA = {
  'product-grid-1': { products: resolveFixtureProducts(fixtureProductGrid.source) },
  'product-tabs-1': fixtureProductTabsData,
};

export default function BlocksDemo() {
  return (
    <View style={{ background: '#f5f5f5', minHeight: '100vh' }}>
      <BlockList blocks={BLOCKS} data={DATA} />
    </View>
  );
}
