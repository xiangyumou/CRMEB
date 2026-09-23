import { describe, expect, it } from 'vitest';

import {
  decorBlocks,
  hotspotImageProps,
  navGridProps,
  noticeProps,
  orderEntryBlock,
  productGridBlock,
  productTabsBlock,
  searchBarProps,
  serviceGridProps,
  spacerProps,
  titleBarProps,
  userCardBlock,
} from './all-blocks';
import { productTabSlot } from './constants';
import { checkDocument, collectReferences, type StoredDocument } from './document';
import { decorBlockExamples } from './examples';
import { migrateBlockProps } from './registry';

const IMAGE = 'https://cdn.example.com/a.jpg';
const base = {
  style: { marginY: 'none', paddingX: 'none', radius: 'none' },
  visibility: { audience: 'all', platforms: [] },
};

function doc(blocks: StoredDocument['blocks']): StoredDocument {
  return { schemaVersion: 2, root: { props: { title: '页' } }, blocks };
}

describe('every registered block', () => {
  it('has an example that is exactly what its schema stores', () => {
    expect(Object.keys(decorBlockExamples).sort()).toEqual([...decorBlocks.types].sort());
    for (const definition of decorBlocks.list()) {
      const example = decorBlockExamples[definition.type as keyof typeof decorBlockExamples];
      expect(definition.props.parse(example), definition.type).toEqual(example);
    }
  });

  it('holds together as one page per kind it allows', () => {
    for (const kind of ['home', 'custom', 'user_center'] as const) {
      const blocks = decorBlocks
        .list()
        .filter((definition) => definition.meta.pages.includes(kind))
        .map((definition) => ({
          id: `b-${definition.type}`,
          type: definition.type,
          v: definition.v,
          props: decorBlockExamples[definition.type as keyof typeof decorBlockExamples],
        }));
      const result = checkDocument(doc(blocks), { kind });
      if (!result.ok) throw new Error('refused');
      expect(result.issues, kind).toEqual([]);
    }
  });
});

describe('商品列表 (productGrid) v2', () => {
  const v1 = {
    source: { mode: 'category', categoryId: '3', sort: 'sales', limit: 4 },
    titleLines: 1,
    showMarketPrice: false,
    showTag: true,
    ...base,
  };

  it('migrates a stored v1 block to the two-column grid it always was', () => {
    expect(migrateBlockProps(productGridBlock, 1, v1)).toEqual({
      ok: true,
      props: { ...v1, layout: 'grid2' },
    });
    const result = checkDocument(doc([{ id: 'g', type: 'productGrid', v: 1, props: v1 }]));
    if (!result.ok) throw new Error('refused');
    expect(result.issues).toEqual([]);
    expect(result.document.blocks[0]).toEqual({
      id: 'g',
      type: 'productGrid',
      v: 2,
      props: { ...v1, layout: 'grid2' },
    });
  });

  it('offers the four layouts', () => {
    for (const layout of ['grid2', 'grid3', 'list', 'scroll']) {
      expect(productGridBlock.props.safeParse({ layout }).success).toBe(true);
    }
    expect(productGridBlock.props.safeParse({ layout: 'grid4' }).success).toBe(false);
  });
});

describe('商品选项卡 (productTabs)', () => {
  it('asks for one product slot per tab, all resolved with the page', () => {
    const props = productTabsBlock.props.parse(decorBlockExamples.productTabs);
    expect(productTabsBlock.data?.(props)).toEqual({
      [productTabSlot(0)]: {
        kind: 'products',
        source: { mode: 'category', categoryId: '3', sort: 'sales', limit: 6 },
      },
      [productTabSlot(1)]: { kind: 'products', source: { mode: 'manual', ids: ['12', '31'] } },
    });
  });

  it('takes 2 to 5 tabs, and finds every tab source as a reference', () => {
    const tab = { title: '甲', source: { mode: 'manual', ids: [] } };
    expect(productTabsBlock.props.safeParse({ tabs: [tab] }).success).toBe(false);
    expect(productTabsBlock.props.safeParse({ tabs: Array(6).fill(tab) }).success).toBe(false);
    const refs = collectReferences(
      doc([{ id: 't', type: 'productTabs', v: 1, props: decorBlockExamples.productTabs }]),
    );
    expect(refs.map((ref) => `${ref.kind}:${ref.id}`)).toEqual([
      'productCategory:3',
      'product:12',
      'product:31',
    ]);
  });
});

describe('the other content blocks', () => {
  it('fill their defaults', () => {
    expect(searchBarProps.parse({})).toMatchObject({
      placeholder: '搜索商品',
      hotWords: [],
      shape: 'round',
      sticky: false,
    });
    expect(titleBarProps.parse({})).toMatchObject({
      title: '标题',
      subtitle: '',
      align: 'left',
      moreText: '更多',
    });
    expect(spacerProps.parse({})).toMatchObject({ height: 24, line: 'none', inset: true });
    expect(navGridProps.parse({ items: [{ icon: IMAGE, label: '领券' }] })).toMatchObject({
      columns: 5,
      rows: 2,
      paging: false,
      iconShape: 'circle',
    });
    expect(noticeProps.parse({ lines: [{ text: '包邮' }] })).toMatchObject({
      label: '公告',
      mode: 'scroll',
      interval: 4000,
    });
  });

  it('never let a notice roll faster than 4 s (design.md motion rule)', () => {
    expect(noticeProps.safeParse({ lines: [{ text: 'a' }], interval: 3000 }).success).toBe(false);
  });

  it('keep every hotspot inside its picture', () => {
    const link = { kind: 'product', id: '1' };
    const ok = { x: 50, y: 50, w: 50, h: 50, link };
    expect(hotspotImageProps.safeParse({ image: IMAGE, hotspots: [ok] }).success).toBe(true);
    const outside = hotspotImageProps.safeParse({
      image: IMAGE,
      hotspots: [{ ...ok, x: 60 }],
    });
    expect(outside.success).toBe(false);
    expect(outside.error?.issues[0]?.message).toBe('热区超出图片范围');
    expect(hotspotImageProps.safeParse({ image: IMAGE, hotspots: [{ ...ok, w: 0 }] }).success).toBe(
      false,
    );
    const refs = collectReferences(
      doc([{ id: 'h', type: 'hotspotImage', v: 1, props: decorBlockExamples.hotspotImage }]),
    );
    expect(refs).toEqual([{ kind: 'product', id: '12', path: 'blocks.0.props.hotspots.0.link' }]);
  });
});

describe('the 个人中心 blocks', () => {
  it('ask for the shopper’s own data as personal needs, not page data', () => {
    expect(userCardBlock.data).toBeUndefined();
    expect(userCardBlock.personal?.(userCardBlock.props.parse({ showStats: false }))).toEqual({
      user: { kind: 'userSummary', stats: false },
    });
    expect(orderEntryBlock.data).toBeUndefined();
    expect(orderEntryBlock.personal?.(orderEntryBlock.props.parse({}))).toEqual({
      counts: { kind: 'orderCounts' },
    });
  });

  it('let a 服务 entry open 客服 without a link, and read an old item as a link', () => {
    const contact = serviceGridProps.parse({ items: [{ label: '客服', action: 'contact' }] });
    expect(contact.items[0]).toEqual({ label: '客服', action: 'contact' });
    const old = serviceGridProps.parse({
      items: [{ label: '收藏', link: { kind: 'route', to: { route: 'favorites', params: {} } } }],
    });
    expect(old.items[0]?.action).toBe('link');
    const missing = serviceGridProps.safeParse({ items: [{ label: '收藏', action: 'link' }] });
    expect(missing.error?.issues[0]).toMatchObject({
      path: ['items', 0, 'link'],
      message: '请选择跳转链接',
    });
  });
});
