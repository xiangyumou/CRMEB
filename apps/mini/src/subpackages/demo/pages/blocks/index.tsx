import { View } from '@tarojs/components';
import { Carousel, ImageCube, ProductGrid } from '@shop/storefront-blocks';
import {
  fixtureCarousel,
  fixtureImageCube,
  fixtureProductGrid,
  resolveFixtureProducts,
} from '@shop/storefront-blocks/fixtures';

/**
 * Dev-only (spike S3): the DIY v2 blocks from `@shop/storefront-blocks`, on the same
 * fixtures as the admin editor's canvas (`/admin/dev/decor-spike`), for the pixel
 * comparison in `packages/storefront-blocks/fidelity`. The background is the page
 * document's default (`#f5f5f5`), as in the canvas.
 */
export default function BlocksDemo() {
  return (
    <View style={{ background: '#f5f5f5', minHeight: '100vh' }}>
      <Carousel props={fixtureCarousel} />
      <ProductGrid
        props={fixtureProductGrid}
        data={{ products: resolveFixtureProducts(fixtureProductGrid.source) }}
      />
      <ImageCube props={fixtureImageCube} />
    </View>
  );
}
