import { example, assertRenderable } from './helpers.mjs';
import {
  toPageProductCard,
  toPageLabel,
  toPageProductList,
  toPageProductPage,
  toPageProductAttr,
  toPageProductValue,
  toPageSku,
  toPageProductDetail,
  toPageAttr,
  toPageRealPrice,
  toPageCategoryTree,
  toPageCategoryVersion,
  toPageReply,
  toPageReplyList,
  toPageReplyPage,
  toPageReplyConfig,
  toPageHotKeywords,
  toPageSearchHistory,
  toPageCollectList,
  toPageVisitList,
  toPageFavoriteResult,
  toPageCollectAllResult,
  fromPageIdList,
  fromPageCommentInput,
} from '../api/mappers/catalog.js';

const DETAIL = example('GET /api/v1/catalog/products/:id');
const LISTED = example('GET /api/v1/catalog/products');
const SKUS = example('GET /api/v1/catalog/products/:id/skus');

describe('toPageProductCard', () => {
  const card = toPageProductCard(LISTED.items[0]);

  it('renames the card fields the list pages bind', () => {
    expect(card).toMatchObject({
      id: 1,
      store_name: '经典白T恤',
      store_info: '100% 新疆长绒棉',
      image: 'https://cdn.example.com/p/1.png',
      price: '59.00',
      ot_price: '99.00',
      stock: 124,
      sales: 141,
      unit_name: '件',
    });
    assertRenderable(card);
  });

  it('keeps money as a string so the template never re-rounds it', () => {
    expect(typeof card.price).toBe('string');
    expect(typeof card.ot_price).toBe('string');
  });

  it('zeroes every retired flag so its UI branch cannot render', () => {
    expect(card).toMatchObject({
      is_vip: 0,
      vip_price: 0,
      svip_price_open: false,
      store_self_mention: 0,
      is_gift: 0,
      is_gift_bag: 0,
    });
    expect(card.activity).toEqual([]);
  });

  it('carries canAddToCart as the cart_button the product bar and the category pages read', () => {
    expect(card.cart_button).toBe(1);
    expect(toPageProductCard({ ...LISTED.items[0], canAddToCart: false }).cart_button).toBe(0);
  });

  it('maps a label', () => {
    expect(card.label[0]).toEqual({
      id: 3,
      label_name: '包邮',
      type: 'text',
      color: '#FFFFFF',
      bg_color: '#E93323',
      border_color: '',
      pic: '',
    });
    expect(toPageLabel(null)).toEqual({});
  });

  it('turns the product kind into the page virtual_type', () => {
    expect(toPageProductCard({ kind: 'physical' })).toMatchObject({ is_virtual: 0, virtual_type: 0 });
    expect(toPageProductCard({ kind: 'virtual_card' })).toMatchObject({ is_virtual: 1, virtual_type: 1 });
    expect(toPageProductCard({ kind: 'virtual_coupon' }).virtual_type).toBe(2);
    expect(toPageProductCard({ kind: 'virtual_manual' }).virtual_type).toBe(3);
  });

  it('survives a missing dto', () => {
    expect(toPageProductCard(null)).toEqual({});
  });
});

describe('list shapes', () => {
  it('returns a bare array, because list pages stop paging on data.length', () => {
    expect(Array.isArray(toPageProductList(LISTED))).toBe(true);
    expect(toPageProductList(null)).toEqual([]);
  });

  it('offers the counted shape too', () => {
    expect(toPageProductPage(LISTED)).toMatchObject({ count: 1, page: 1, limit: 20 });
  });
});

describe('specs and skus', () => {
  it('reshapes specs into productAttr', () => {
    const attr = toPageProductAttr(SKUS.specs);
    expect(attr[0]).toEqual({
      attr_name: '颜色',
      attr_values: ['白'],
      attr_value: [{ attr: '白', pic: 'https://cdn.example.com/p/1-white.png' }],
    });
    expect(attr[1].attr_values).toEqual(['M', 'L']);
    expect(toPageProductAttr(null)).toEqual([]);
  });

  it('keys productValue the way skuSelect looks it up — attr values joined by a comma', () => {
    const values = toPageProductValue(SKUS.skus, '经典白T恤');
    expect(Object.keys(values)).toEqual(['白,M', '白,L']);
    expect(values['白,M']).toMatchObject({
      suk: '白,M',
      unique: '1001',
      sku_code: 'SKU7K3M9QX2',
      price: '59.00',
      stock: 120,
      store_name: '经典白T恤',
    });
  });

  it('puts the sku id — not the sku code — in `unique`, because that is what the cart takes back', () => {
    expect(toPageSku(SKUS.skus[0]).unique).toBe('1001');
    expect(toPageSku(null)).toEqual({});
  });
});

describe('toPageProductDetail', () => {
  const detail = toPageProductDetail(DETAIL);

  it('fills storeInfo, productAttr and productValue together', () => {
    expect(detail.storeInfo).toMatchObject({
      id: 1,
      store_name: '经典白T恤',
      spec_type: 1,
      min_qty: 1,
      limit_num: 5,
      limit_type: 'per_order',
      freight_type: 'template',
      browse: 3820,
      unique: '1001',
      default_sku: '白,M',
    });
    expect(detail.storeInfo.slider_image).toHaveLength(2);
    expect(detail.productAttr).toHaveLength(2);
    expect(Object.keys(detail.productValue)).toHaveLength(2);
    expect(detail.spec_unique).toBe('1001');
    assertRenderable(detail);
  });

  it('pins the retired 分销 「最高返佣」 priceName to 0, so the red-packet badge never renders', () => {
    // `goods_details` shows `shareRedPackets` when `priceName != 0` and prints
    // the value as text: an object here was the raw JSON on the product page.
    expect(detail.priceName).toBe(0);
    expect(detail.storeInfo.cart_button).toBe(1);
  });

  it('treats "no purchase limit" as 0', () => {
    expect(toPageProductDetail({ ...DETAIL, purchaseLimitMode: 'none' }).storeInfo.limit_num).toBe(0);
  });

  it('carries the params and the protection list', () => {
    expect(detail.storeInfo.params_list[0]).toEqual({ name: '面料', value: '纯棉' });
    expect(detail.storeInfo.protection_list[0]).toMatchObject({ id: 1, title: '七天无理由退换' });
  });

  it('survives a missing dto', () => {
    expect(toPageProductDetail(null)).toEqual({});
  });
});

describe('toPageAttr / toPageRealPrice', () => {
  it('answers getAttr with the three keys the page reads', () => {
    const attr = toPageAttr(SKUS, '经典白T恤');
    expect(Object.keys(attr).sort()).toEqual(['productAttr', 'productValue', 'storeInfo']);
    expect(attr.storeInfo).toMatchObject({ id: 1, spec_type: 1, unique: '1001' });
    expect(toPageAttr(null)).toEqual({});
  });

  it('picks one sku out of the list by its id', () => {
    expect(toPageRealPrice(SKUS, '1002')).toEqual({
      real_price: '59.00',
      ot_price: '99.00',
      member_price: 0,
    });
  });

  it('answers empty strings for a sku that is not there', () => {
    expect(toPageRealPrice(SKUS, 'nope')).toEqual({ real_price: '', ot_price: '', member_price: 0 });
    expect(toPageRealPrice(null, '1')).toMatchObject({ real_price: '' });
  });
});

describe('categories', () => {
  const CATS = example('GET /api/v1/catalog/categories');

  it('keeps the tree and renames the node', () => {
    const tree = toPageCategoryTree(CATS);
    expect(tree[0]).toMatchObject({ id: 7, cate_name: '男装', pic: 'https://cdn.example.com/cate/men.png' });
    expect(tree[0].children[0]).toMatchObject({ id: 17, cate_name: 'T恤', children: [] });
    expect(toPageCategoryTree(null)).toEqual([]);
  });

  it('reads the version off the cheap route, and off the tree', () => {
    // `getCategoryVersion` now calls `…/categories/version`; the mapper still
    // works on the tree, which is why the page wants the tree.
    expect(toPageCategoryVersion(example('GET /api/v1/catalog/categories/version')))
      .toEqual({ version: '1742534400-17' });
    expect(toPageCategoryVersion(CATS)).toEqual({ version: '1742534400-17' });
    expect(toPageCategoryVersion(null)).toEqual({ version: '' });
  });
});

describe('reviews', () => {
  const REVIEWS = example('GET /api/v1/catalog/products/:id/reviews');

  it('maps a review the way userEvaluation renders it', () => {
    const reply = toPageReply(REVIEWS.items[0]);
    expect(reply).toMatchObject({
      id: 5001,
      unique: '1001',
      suk: '白,M',
      nickname: '小明',
      product_score: 5,
      star: 5,
      comment: '料子很舒服，洗了不变形。',
      merchant_reply_content: '感谢支持！',
    });
    expect(reply.pics).toEqual(['https://cdn.example.com/r/5001-1.png']);
    assertRenderable(reply);
  });

  it('renders the timestamp in the offset the server sent, not the phone timezone', () => {
    expect(toPageReply(REVIEWS.items[0]).add_time).toBe('2026-03-01 20:11:00');
  });

  it('offers both the array and the counted page', () => {
    expect(toPageReplyList(REVIEWS)).toHaveLength(1);
    expect(toPageReplyPage(REVIEWS)).toMatchObject({ count: 1 });
    expect(toPageReplyList(null)).toEqual([]);
    expect(toPageReply(null)).toEqual({});
  });

  it('maps the summary', () => {
    expect(toPageReplyConfig(example('GET /api/v1/catalog/products/:id/review-summary'))).toEqual({
      sum_count: 18,
      good_count: 16,
      in_count: 1,
      poor_count: 1,
      pics_count: 7,
      reply_chance: 89,
      reply_star: 4.6,
    });
    expect(toPageReplyConfig(null)).toMatchObject({ sum_count: 0, reply_star: 5 });
  });
});

describe('search, favourites and history', () => {
  it('flattens hot keywords to strings', () => {
    expect(toPageHotKeywords(example('GET /api/v1/catalog/search/hot-keywords')))
      .toEqual(['白T恤', '卫衣']);
    expect(toPageHotKeywords(null)).toEqual([]);
  });

  it('maps the personal search history', () => {
    const history = toPageSearchHistory(example('GET /api/v1/me/search-history'));
    expect(history[0].keyword).toBe('白T恤');
    expect(typeof history[0].add_time).toBe('number');
  });

  it('flattens a favourite row onto the product card', () => {
    const out = toPageCollectList(example('GET /api/v1/me/favorites'));
    expect(out.count).toBe(1);
    expect(out.list[0]).toMatchObject({ id: 1, product_id: 1, store_name: '经典白T恤', category: 'product' });
    assertRenderable(out);
  });

  it('groups the browse history by day, which is what the page renders', () => {
    const out = toPageVisitList(example('GET /api/v1/me/history'));
    expect(out.list[0]).toMatchObject({ product_id: 1, time: '2026-09-21' });
    expect(out.time).toEqual(['2026-09-21']);
    expect(toPageVisitList(null)).toEqual({ list: [], count: 0, time: [] });
  });

  it('answers collectAdd with a boolean the page only toasts', () => {
    expect(toPageFavoriteResult({ favorited: true })).toEqual({ favorited: true });
    expect(toPageFavoriteResult(null)).toEqual({ favorited: false });
  });

  it('collapses the batch answer to the one flag collectAll reports', () => {
    const out = toPageCollectAllResult(example('POST /api/v1/me/favorites/batch'));
    expect(out).toEqual({
      favorited: true,
      added: 2,
      list: [
        { product_id: 1, favorited: true },
        { product_id: 2, favorited: true },
      ],
    });
  });

  it('is not "收藏成功" when one of the ids could not be favourited', () => {
    const out = toPageCollectAllResult({
      added: 1,
      items: [
        { productId: '1', favorited: true },
        { productId: '2', favorited: false },
      ],
    });
    expect(out.favorited).toBe(false);
    expect(out.added).toBe(1);
    expect(toPageCollectAllResult(null)).toEqual({ favorited: false, added: 0, list: [] });
  });
});

describe('the fromPage direction', () => {
  it('accepts an id list as an array, a comma string or a single value', () => {
    expect(fromPageIdList(['1', 2])).toEqual(['1', '2']);
    expect(fromPageIdList('1,2,3')).toEqual(['1', '2', '3']);
    expect(fromPageIdList(7)).toEqual(['7']);
    expect(fromPageIdList('')).toEqual([]);
    expect(fromPageIdList(null)).toEqual([]);
  });

  it('builds the review body the contract takes', () => {
    const body = fromPageCommentInput({
      unique: '7001',
      comment: '好',
      pics: ['a.jpg'],
      product_score: 5,
      service_score: 4,
    });
    expect(body).toMatchObject({ content: '好', images: ['a.jpg'], productScore: 5, serviceScore: 4 });
  });
});
