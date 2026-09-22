// 资讯 (cms) and 省市区 (shipping cities).
//
// Fixtures are the contracts' own examples, so a mapper is never tested against a
// payload the author of the test invented.

import { example, assertRenderable } from './helpers.mjs';
import {
  toLegacyArticle,
  toLegacyArticleList,
  toLegacyArticleDetail,
  toLegacyArticleProduct,
  toLegacyArticleCategories,
} from '../api/mappers/cms.js';
import { toLegacyCityTree, cityTreeVersion } from '../api/mappers/region.js';

describe('cms — 文章', () => {
  it('turns the list into the bare array the pages concat onto', () => {
    const rows = toLegacyArticleList(example('GET /api/v1/articles'));
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 101,
      cid: 3,
      catename: '新闻资讯',
      title: '双十一活动说明',
      synopsis: '活动时间、优惠券发放与常见问题。',
      author: '运营部',
      visit: 3421,
      likes: 0,
      is_hot: 1,
      is_banner: 0,
      add_time: '2026-10-20 10:00:00',
    });
    assertRenderable(rows);
  });

  it('makes image_input an array the length branches can count', () => {
    // `news_list` renders 1 / 2 / >2 thumbnails off `item.image_input.length`.
    expect(toLegacyArticle({ coverImageUrl: '/a.png' }).image_input).toEqual(['/a.png']);
    expect(toLegacyArticle({ coverImageUrl: null }).image_input).toEqual([]);
    expect(toLegacyArticle({}).image_input).toEqual([]);
  });

  it('keeps add_time parseable and in the offset the payload carried', () => {
    const row = toLegacyArticle({ publishedAt: '2026-10-20T10:00:00+08:00' });
    // `articleList.vue` runs it through dayjs; the wall clock must be the server's.
    expect(row.add_time).toBe('2026-10-20 10:00:00');
    expect(toLegacyArticle({ publishedAt: null }).add_time).toBe('');
  });

  it('carries the detail body and its 关联商品 card', () => {
    const detail = toLegacyArticleDetail(example('GET /api/v1/articles/:id'));
    expect(detail.content).toContain('活动时间');
    expect(detail.store_info).toEqual({
      id: 77,
      store_name: '云南小粒咖啡豆 500g',
      image: '/uploads/2026/01/coffee.png',
      price: '69.00',
      ot_price: '99.00',
    });
    assertRenderable(detail);
  });

  it('answers an empty 关联商品 object rather than null, because the card reads store_info.id', () => {
    expect(toLegacyArticleProduct(null)).toEqual({});
    expect(toLegacyArticleDetail({ product: null }).store_info).toEqual({});
  });

  it('nests the categories two levels deep, children always an array', () => {
    const cats = toLegacyArticleCategories(example('GET /api/v1/article-categories'));
    expect(cats).toEqual([
      {
        id: 3,
        title: '新闻资讯',
        image: '/uploads/2026/01/news.png',
        children: [{ id: 4, title: '商城公告', image: '' }],
      },
    ]);
    // the tab handler reads `item.children.length` before anything else
    expect(toLegacyArticleCategories({ items: [{ id: '9', title: 'x' }] })[0].children).toEqual([]);
    assertRenderable(cats);
  });
});

describe('shipping — 省市区', () => {
  it('rebuilds the {v, n, c} tree the picker indexes into', () => {
    const tree = toLegacyCityTree(example('GET /api/v1/cities'));
    expect(tree[0]).toMatchObject({ v: 110000, n: '北京' });
    expect(tree[0].c[0]).toMatchObject({ v: 110100, n: '北京市' });
    expect(tree[0].c[0].c.map((d) => d.n)).toEqual(['东城区', '西城区']);
    assertRenderable(tree);
  });

  it('gives every node a `c` array, because the picker walks it unguarded', () => {
    const tree = toLegacyCityTree(example('GET /api/v1/cities'));
    const leaf = tree[0].c[0].c[0];
    expect(leaf.c).toEqual([]);
    expect(toLegacyCityTree(null)).toEqual([]);
    expect(toLegacyCityTree({})).toEqual([]);
  });

  it('carries the immutable tree fingerprint', () => {
    expect(cityTreeVersion(example('GET /api/v1/cities'))).toBe('cities-3939-820000');
    expect(cityTreeVersion(null)).toBe('');
  });
});
