import type { CarouselProps } from './schema/carousel';
import type { ProductSummary } from './schema/common';
import type { ImageCubeProps } from './schema/image-cube';
import type { ProductGridProps } from './schema/product-grid';

/**
 * Fixture data for tests, the admin spike page, the fidelity script and the
 * mini-program's dev page: the *same* props and data on every surface, so a
 * difference in pixels is a difference in rendering.
 *
 * Images are inline SVG data URIs — deterministic, no network, no uploads —
 * and carry no text, so font rendering never enters an image.
 */

function svg(width: number, height: number, body: string): string {
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}

function banner(from: string, to: string, accent: string): string {
  return svg(
    750,
    340,
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>` +
      `<rect width="750" height="340" fill="url(#g)"/>` +
      `<circle cx="600" cy="120" r="140" fill="${accent}" fill-opacity=".35"/>` +
      `<rect x="60" y="90" width="300" height="44" rx="22" fill="#fff" fill-opacity=".9"/>` +
      `<rect x="60" y="160" width="200" height="28" rx="14" fill="#fff" fill-opacity=".6"/>`,
  );
}

function square(hue: number): string {
  return svg(
    400,
    400,
    `<rect width="400" height="400" fill="hsl(${hue} 60% 88%)"/>` +
      `<circle cx="200" cy="170" r="110" fill="hsl(${hue} 65% 60%)"/>` +
      `<rect x="90" y="300" width="220" height="36" rx="18" fill="hsl(${hue} 55% 45%)"/>`,
  );
}

function tile(width: number, height: number, hue: number): string {
  return svg(
    width,
    height,
    `<rect width="${width}" height="${height}" fill="hsl(${hue} 70% 62%)"/>` +
      `<rect x="${width * 0.1}" y="${height * 0.14}" width="${width * 0.5}" height="${height * 0.12}" rx="${height * 0.06}" fill="#fff" fill-opacity=".85"/>` +
      `<circle cx="${width * 0.72}" cy="${height * 0.66}" r="${Math.min(width, height) * 0.22}" fill="#fff" fill-opacity=".35"/>`,
  );
}

export const fixtureCarousel: CarouselProps = {
  slides: [
    {
      image: banner('#ff7a45', '#e93323', '#ffd666'),
      alt: '秋季上新',
      link: { kind: 'route', route: 'couponCenter' },
    },
    {
      image: banner('#36cfc9', '#1677ff', '#b37feb'),
      alt: '爆款直降',
      link: { kind: 'product', id: '12' },
    },
    {
      image: banner('#95de64', '#389e0d', '#fff566'),
      alt: '新人专享',
      link: { kind: 'category', id: '3' },
    },
  ],
  height: 340,
  // Off in fixtures: a screenshot must not catch the slider mid-transition.
  autoplay: false,
  interval: 3000,
  indicator: 'dots',
  indicatorColor: '#ffffff80',
  indicatorActiveColor: '#ffffff',
  style: { marginY: 'none', paddingX: 'none', radius: 'none' },
};

export const fixtureProducts: ProductSummary[] = [
  {
    id: '12',
    title: '秋季新款宽松针织开衫 女士百搭外套',
    image: square(12),
    price: '129.90',
    marketPrice: '199.00',
    tag: '新品',
  },
  {
    id: '13',
    title: '云南古树普洱茶饼 357g',
    image: square(30),
    price: '88.00',
    marketPrice: '128.00',
  },
  {
    id: '14',
    title: '主动降噪真无线蓝牙耳机 长续航',
    image: square(210),
    price: '299.00',
    tag: '热卖',
  },
  { id: '15', title: '厨房收纳三件套', image: square(150), price: '39.90', marketPrice: '59.90' },
  {
    id: '16',
    title: '儿童绘本套装（全 10 册）精装版 睡前故事',
    image: square(280),
    price: '76.50',
    tag: '特价',
  },
  { id: '17', title: '不锈钢保温杯 500ml', image: square(330), price: '49.00' },
];

export const fixtureProductGrid: ProductGridProps = {
  source: { mode: 'manual', ids: fixtureProducts.map((product) => product.id) },
  titleLines: 2,
  showMarketPrice: true,
  showTag: true,
  style: { marginY: 'none', paddingX: 'none', radius: 'none' },
};

export const fixtureImageCube: ImageCubeProps = {
  layout: 'left1right2',
  cells: [
    { image: tile(360, 360, 5), link: { kind: 'route', route: 'groupbuyList' } },
    { image: tile(360, 175, 45), link: { kind: 'article', id: '7' } },
    { image: tile(360, 175, 190), link: { kind: 'webview', url: 'https://example.com/promo' } },
    { image: tile(360, 175, 260) },
  ],
  height: 360,
  gap: 10,
  style: { marginY: 'sm', paddingX: 'md', radius: 'none' },
};

/** A row layout, to exercise `widthFix`. */
export const fixtureImageCubeRow: ImageCubeProps = {
  ...fixtureImageCube,
  layout: 'row3',
  cells: [
    { image: tile(230, 300, 20) },
    { image: tile(230, 300, 100) },
    { image: tile(230, 300, 220) },
  ],
};

/** Resolves a product grid's source against the fixtures, as the server resolver will. */
export function resolveFixtureProducts(source: ProductGridProps['source']): ProductSummary[] {
  if (source.mode === 'manual') {
    return source.ids.flatMap((id) => fixtureProducts.find((product) => product.id === id) ?? []);
  }
  const sorted = [...fixtureProducts];
  if (source.sort === 'priceAsc') sorted.sort((a, b) => fen(a.price) - fen(b.price));
  if (source.sort === 'newest') sorted.reverse();
  return sorted.slice(0, source.limit);
}

/** `"129.90"` → 12990: integer fen, never a float. */
function fen(price: string): number {
  return Number.parseInt(price.replace('.', ''), 10);
}
