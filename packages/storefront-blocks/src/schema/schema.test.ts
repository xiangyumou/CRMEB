import { describe, expect, it } from 'vitest';

import { fixtureCarousel, fixtureImageCube, fixtureProductGrid } from '../fixtures';
import { carouselProps } from './carousel';
import { validatePageDocument } from './document';
import { imageCubeProps } from './image-cube';
import { linkTarget } from './link';
import { unwrapSchema } from './meta';
import { productGridProps } from './product-grid';

describe('block prop schemas', () => {
  it('accept the fixtures unchanged', () => {
    expect(carouselProps.parse(fixtureCarousel)).toEqual(fixtureCarousel);
    expect(productGridProps.parse(fixtureProductGrid)).toEqual(fixtureProductGrid);
    expect(imageCubeProps.parse(fixtureImageCube)).toEqual(fixtureImageCube);
  });

  it('fill every default from a nearly empty input', () => {
    const parsed = productGridProps.parse({});
    expect(parsed).toEqual({
      source: { mode: 'manual', ids: [] },
      titleLines: 2,
      showMarketPrice: true,
      showTag: true,
      style: { marginY: 'none', paddingX: 'none', radius: 'none' },
    });
  });

  it('carry editor metadata through optional / default wrappers', () => {
    const height = unwrapSchema(carouselProps.shape.height);
    expect(height.meta?.label).toBe('高度（750 设计稿 px）');
    expect(height.defaultValue).toBe(340);
    const link = unwrapSchema(carouselProps.shape.slides.element.shape.link);
    expect(link.meta).toMatchObject({ label: '跳转链接', field: 'link' });
    expect(link.optional).toBe(true);
  });
});

describe('LinkTarget', () => {
  it('is a typed target, never a path string', () => {
    expect(linkTarget.safeParse({ kind: 'product', id: '12' }).success).toBe(true);
    expect(linkTarget.safeParse({ kind: 'route', route: 'cart' }).success).toBe(true);
    expect(linkTarget.safeParse('/pages/goods_details/index?id=12').success).toBe(false);
    expect(linkTarget.safeParse({ kind: 'route', route: '/pages/index/index' }).success).toBe(
      false,
    );
  });

  it('opens only https pages in a web-view and checks a mini-program AppID', () => {
    expect(linkTarget.safeParse({ kind: 'webview', url: 'http://example.com' }).success).toBe(
      false,
    );
    expect(linkTarget.safeParse({ kind: 'miniprogram', appId: 'wx123' }).success).toBe(false);
    expect(
      linkTarget.safeParse({ kind: 'miniprogram', appId: 'wx0123456789abcdef', path: 'pages/a' })
        .success,
    ).toBe(true);
  });
});

describe('validatePageDocument', () => {
  const doc = {
    schemaVersion: 2,
    root: { props: { title: '首页', background: '#f5f5f5', shareTitle: '' } },
    blocks: [
      { id: 'a', type: 'carousel', v: 1, props: fixtureCarousel },
      { id: 'b', type: 'productGrid', v: 1, props: { source: { mode: 'manual', ids: ['12'] } } },
    ],
  };

  it('parses every known block and fills its defaults', () => {
    const result = validatePageDocument(doc);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.blocks[1]?.props).toMatchObject({ titleLines: 2, showTag: true });
    expect(result.unknownBlocks).toEqual([]);
  });

  it('passes an unknown block type through and reports it', () => {
    const result = validatePageDocument({
      ...doc,
      blocks: [...doc.blocks, { id: 'z', type: 'fromTheFuture', v: 3, props: { x: 1 } }],
    });
    expect(result.ok && result.unknownBlocks).toEqual(['fromTheFuture']);
  });

  it('reports invalid props with a path into the document', () => {
    const result = validatePageDocument({
      ...doc,
      blocks: [{ id: 'a', type: 'carousel', v: 1, props: { ...fixtureCarousel, slides: [] } }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]).toEqual({ path: 'blocks.0.props.slides', message: '至少一张图片' });
  });

  it('refuses duplicate block ids and a block at an old version', () => {
    const result = validatePageDocument({
      ...doc,
      blocks: [doc.blocks[0], { ...doc.blocks[0], v: 0 }],
    });
    expect(result.ok).toBe(false);
  });
});
