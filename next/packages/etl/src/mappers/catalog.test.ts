import { describe, expect, it } from 'vitest';
import {
  decodeLegacyHtml,
  mapCatalog,
  type CatalogMigrationInput,
  type LegacyProductAttr,
  type LegacyProductAttrValue,
  type LegacyProductLabel,
  type LegacyProductReply,
  type LegacyStoreCategory,
  type LegacyStoreProduct,
} from './catalog';

/**
 * The mapper against literal legacy rows.
 *
 * Every row below the `seed*` line is copied verbatim out of
 * `crmeb/public/install/crmeb.sql`: the categories from the
 * `INSERT INTO eb_store_category` at line 27557, the products from
 * `INSERT INTO eb_store_product` at line 28119, the spec axes from
 * `eb_store_product_attr` at 28145, the variants from
 * `eb_store_product_attr_value` at 28270 and the category links from
 * `eb_store_product_cate` at 28346. A migration test with invented input
 * proves nothing: this one fails the day somebody guesses at a legacy column
 * instead of reading one.
 *
 * The dump ships no label, param-template, protection, card-key, favourite or
 * review rows — those tables are empty in a fresh install — so the cases that
 * need them build on a seed row with one field changed, and say so.
 */

const MIGRATED_AT = new Date('2026-07-01T00:00:00.000Z');

// --- `INSERT INTO eb_store_category` ---------------------------------------
const seedCategories: LegacyStoreCategory[] = [
  { id: 1, pid: 0, cate_name: '手机数码', sort: 99, pic: '', is_show: 1, add_time: 1676271495 },
  { id: 2, pid: 0, cate_name: '电脑办公', sort: 88, pic: '', is_show: 1, add_time: 1676271503 },
  { id: 5, pid: 0, cate_name: '家电电器', sort: 55, pic: '', is_show: 1, add_time: 1676271597 },
  {
    id: 10,
    pid: 1,
    cate_name: '智能手机',
    sort: 9,
    pic: 'http://demo.crmeb.com/uploads/attach/2023/02/20230213/3e1e810aad648bd4449b3a01d738a52a.jpg',
    is_show: 1,
    add_time: 1676271818,
  },
  {
    id: 12,
    pid: 1,
    cate_name: '影音周边',
    sort: 8,
    pic: 'http://demo.crmeb.com/uploads/attach/2023/02/20230213/75b6b32021bc79734ceb90f0be0b2c14.jpg',
    is_show: 1,
    add_time: 1676271861,
  },
  {
    id: 29,
    pid: 5,
    cate_name: '小家电',
    sort: 8,
    pic: 'http://demo.crmeb.com/uploads/attach/2023/02/20230213/542267cb5f660e19c6647a71913c5624.jpg',
    is_show: 1,
    add_time: 1676273488,
  },
];

// --- `INSERT INTO eb_store_product` ----------------------------------------
// The insert names 58 of the table's 65 columns; the seven it leaves out
// (`min_qty`, `default_sku`, `params_list`, `label_list`, `protection_list`,
// `is_gift`, `gift_price`) take their DDL defaults, which is what `product()`
// fills in.
const seedProducts: LegacyStoreProduct[] = [
  product({
    id: 1,
    image:
      'http://demo.crmeb.com/uploads/attach/2023/02/20230213/3b570808fc3593aa51b2a94ceaba3e6f.png',
    slider_image:
      '["http:\\/\\/demo.crmeb.com\\/uploads\\/attach\\/2023\\/02\\/20230213\\/3b570808fc3593aa51b2a94ceaba3e6f.png","http:\\/\\/demo.crmeb.com\\/uploads\\/attach\\/2023\\/02\\/20230213\\/e91ef8d30ee780f84c5966649117bcba.jpeg"]',
    store_name: 'Xiaomi Civi 2 冰冰蓝 8GB+128GB',
    cate_id: '10,12,13,15,16,17',
    price: '2299.00',
    ot_price: '2899.00',
    postage: '0.00',
    unit_name: '个',
    stock: 400,
    is_best: 1,
    add_time: 1676280949,
    cost: '2099.00',
    ficti: 18,
    spec_type: 1,
    spu: '5399565077794',
    freight: 2,
    is_limit: 1,
    limit_type: 2,
    limit_num: 2,
  }),
  product({
    id: 2,
    image:
      'http://demo.crmeb.com/uploads/attach/2023/02/20230213/cf5414089d598d064b0a4d7154a4f491.png',
    store_name: 'BINNIFA客厅音响无线立体环绕K歌观影一体家庭影院Live3D',
    cate_id: '12,27,29',
    price: '1999.00',
    ot_price: '2199.00',
    postage: '1.00',
    unit_name: '套',
    stock: 100,
    is_best: 1,
    add_time: 1676281443,
    cost: '1699.00',
    ficti: 11,
    spec_type: 1,
    spu: '5152534940292',
    recommend_list: '1',
    freight: 2,
    is_limit: 1,
    limit_type: 1,
    limit_num: 1,
  }),
  product({
    id: 3,
    image:
      'http://demo.crmeb.com/uploads/attach/2023/02/20230213/5ae4f6a3f8bf153beb849e02e14b5c40.png',
    store_name: '蓝牙音乐手表 | Jeep智能表蓝牙通话健康管理 P07',
    cate_id: '13,15,12,17,10',
    price: '269.00',
    ot_price: '359.00',
    postage: '0.00',
    unit_name: '件',
    stock: 100,
    is_best: 1,
    add_time: 1676281988,
    cost: '219.00',
    ficti: 30,
    spec_type: 1,
    spu: '5254981082521',
    recommend_list: '1,2',
    freight: 2,
    is_limit: 0,
    limit_type: 0,
    limit_num: 0,
  }),
  product({
    id: 4,
    image:
      'http://demo.crmeb.com/uploads/attach/2023/02/20230213/5b64e6584c06020347a5fa58af79d42a.png',
    store_name: 'Apple/苹果iPad mini6 8.3英寸平板电脑 64G-WLAN版 深空灰色',
    cate_id: '16,15,12,10,13,17',
    price: '3999.00',
    ot_price: '4799.00',
    postage: '0.00',
    unit_name: '个',
    stock: 1600,
    is_best: 1,
    add_time: 1676283290,
    cost: '3299.00',
    ficti: 10,
    spec_type: 1,
    spu: '9748975626070',
    recommend_list: '1,2,3',
    freight: 2,
    is_limit: 1,
    limit_type: 2,
    limit_num: 2,
  }),
];

// --- `INSERT INTO eb_store_product_attr` ------------------------------------
// The `type = 1` rows (ids 9 and 10) are the 秒杀 copy of product 1's axes and
// their `product_id` is a *seckill* id; they are in the fixture precisely so
// the mapper has a chance to get that wrong.
const seedAttrs: LegacyProductAttr[] = [
  { id: 9, product_id: 1, attr_name: '颜色', attr_values: '冰冰蓝,小白裙', type: 1 },
  { id: 10, product_id: 1, attr_name: '机型', attr_values: '8+128,8+256', type: 1 },
  { id: 42, product_id: 1, attr_name: '颜色', attr_values: '冰冰蓝,小白裙', type: 0 },
  { id: 43, product_id: 1, attr_name: '机型', attr_values: '8+128,8+256', type: 0 },
  { id: 45, product_id: 3, attr_name: '颜色', attr_values: '黑色', type: 0 },
  { id: 46, product_id: 3, attr_name: '直径', attr_values: '46mm', type: 0 },
  { id: 47, product_id: 4, attr_name: '颜色', attr_values: '深空灰色,紫色,星光色,粉色', type: 0 },
  { id: 48, product_id: 4, attr_name: '版本', attr_values: '64G,256G', type: 0 },
  { id: 49, product_id: 4, attr_name: '型号', attr_values: 'WLAN版,蜂窝版', type: 0 },
  { id: 58, product_id: 1, attr_name: '颜色', attr_values: '深空灰色,紫色', type: 2 },
  { id: 64, product_id: 2, attr_name: '颜色', attr_values: '银色', type: 0 },
];

// --- `INSERT INTO eb_store_product_attr_value` ------------------------------
const P1_IMAGE =
  'http://demo.crmeb.com/uploads/attach/2023/02/20230213/3b570808fc3593aa51b2a94ceaba3e6f.png';
const P4_IMAGE =
  'http://demo.crmeb.com/uploads/attach/2023/02/20230213/5b64e6584c06020347a5fa58af79d42a.png';

const seedAttrValues: LegacyProductAttrValue[] = [
  // (12, 1, …, 1) — the 秒杀 variant, `type = 1`.
  attrValue({ id: 12, product_id: 1, suk: '冰冰蓝,8+128', unique: '2035bf28', type: 1 }),
  // The `type = 0` rows for product 1.
  attrValue({ id: 76, product_id: 1, suk: '冰冰蓝,8+128', unique: 'a1a5e606' }),
  attrValue({ id: 77, product_id: 1, suk: '冰冰蓝,8+256', unique: '3023a2cc' }),
  attrValue({ id: 78, product_id: 1, suk: '小白裙,8+128', unique: 'a918ea81' }),
  attrValue({ id: 79, product_id: 1, suk: '小白裙,8+256', unique: 'fdc24d0f' }),
  // (81, 3, '黑色,46mm', …, 0)
  attrValue({
    id: 81,
    product_id: 3,
    suk: '黑色,46mm',
    unique: '11c60075',
    price: '269.00',
    ot_price: '359.00',
    cost: '219.00',
    bar_code: '',
    image:
      'http://demo.crmeb.com/uploads/attach/2023/02/20230213/5ae4f6a3f8bf153beb849e02e14b5c40.png',
  }),
  // Two of product 4's sixteen `type = 0` rows.
  attrValue({
    id: 82,
    product_id: 4,
    suk: '深空灰色,64G,WLAN版',
    unique: 'fcd734ba',
    price: '3999.00',
    ot_price: '4799.00',
    cost: '3299.00',
    bar_code: '',
    image: P4_IMAGE,
  }),
  attrValue({
    id: 83,
    product_id: 4,
    suk: '深空灰色,64G,蜂窝版',
    unique: '1aead9ce',
    price: '4399.00',
    ot_price: '4799.00',
    cost: '3299.00',
    bar_code: '',
    image: P4_IMAGE,
  }),
  // (103, 2, '银色', …, 0) — product 2's only plain variant.
  attrValue({
    id: 103,
    product_id: 2,
    suk: '银色',
    unique: '318d6620',
    price: '1999.00',
    ot_price: '2199.00',
    cost: '1699.00',
    bar_code: '',
    image:
      'http://demo.crmeb.com/uploads/attach/2023/02/20230213/cf5414089d598d064b0a4d7154a4f491.png',
  }),
];

// --- `INSERT INTO eb_store_product_cate` ------------------------------------
const seedProductCategories = [
  { product_id: 1, cate_id: 10 },
  { product_id: 1, cate_id: 12 },
  { product_id: 2, cate_id: 12 },
  { product_id: 2, cate_id: 29 },
];

function baseInput(overrides: Partial<CatalogMigrationInput> = {}): CatalogMigrationInput {
  return {
    categories: seedCategories,
    products: seedProducts,
    productCategories: seedProductCategories,
    attrs: seedAttrs,
    attrValues: seedAttrValues,
    migratedAt: MIGRATED_AT,
    ...overrides,
  };
}

describe('mapCatalog: the category tree', () => {
  it('materialises the path and depth and flips the legacy sort', () => {
    const { categories } = mapCatalog(baseInput());
    const root = categories.find((c) => c.id === 1)!;
    const child = categories.find((c) => c.id === 10)!;

    expect(root).toMatchObject({ parentId: null, path: '/', level: 0, sortOrder: -99 });
    expect(child).toMatchObject({ parentId: 1, path: '/1/', level: 1, sortOrder: -9 });
    // 手机数码 sorts 99 and 家电电器 55: legacy counts down, the new tree counts
    // up, so the inverted order has to put 手机数码 first.
    const roots = categories.filter((c) => c.level === 0).sort((a, b) => a.sortOrder - b.sortOrder);
    expect(roots.map((c) => c.name)).toEqual(['手机数码', '电脑办公', '家电电器']);
    expect(child.iconUrl).toContain('3e1e810aad648bd4449b3a01d738a52a.jpg');
    expect(root.createdAt).toEqual(new Date(1676271495 * 1000));
  });

  it('reparents a category whose parent is gone rather than emitting a broken FK', () => {
    const orphan: LegacyStoreCategory = {
      id: 77,
      pid: 999,
      cate_name: '孤儿分类',
      sort: 1,
      pic: '',
      is_show: 1,
      add_time: 1676271495,
    };
    const { categories, report } = mapCatalog(
      baseInput({ categories: [...seedCategories, orphan] }),
    );
    expect(categories.find((c) => c.id === 77)).toMatchObject({
      parentId: null,
      path: '/',
      level: 0,
    });
    expect(report.categoriesReparentedToRoot).toBe(1);
  });

  it('breaks a parent cycle instead of looping forever', () => {
    const a: LegacyStoreCategory = {
      id: 90,
      pid: 91,
      cate_name: '甲',
      sort: 0,
      pic: '',
      is_show: 1,
      add_time: 0,
    };
    const b: LegacyStoreCategory = { ...a, id: 91, pid: 90, cate_name: '乙' };
    const { categories, report } = mapCatalog(baseInput({ categories: [a, b] }));
    expect(categories.map((c) => c.level)).toEqual([0, 0]);
    expect(report.categoriesReparentedToRoot).toBe(2);
    // No `add_time` in the dump means no timestamp; the cutover instant is the
    // only honest stand-in.
    expect(categories[0]!.createdAt).toEqual(MIGRATED_AT);
  });
});

describe('mapCatalog: products', () => {
  it('maps the four seed products with their prices, flags and category links', () => {
    const { products, productCategories, report } = mapCatalog(baseInput());
    expect(report.products).toBe(4);

    const xiaomi = products.find((p) => p.id === 1)!;
    expect(xiaomi).toMatchObject({
      name: 'Xiaomi Civi 2 冰冰蓝 8GB+128GB',
      kind: 'physical',
      status: 'on_shelf',
      spu: '5399565077794',
      unitName: '个',
      originalPrice: '2899.00',
      displaySalesBoost: 18,
      specMode: true,
      isBest: true,
      isRecommended: false,
      deletedAt: null,
    });
    // `slider_image` is a JSON array with escaped slashes.
    expect(xiaomi.sliderImages).toHaveLength(2);
    expect(xiaomi.sliderImages[1]).toBe(
      'http://demo.crmeb.com/uploads/attach/2023/02/20230213/e91ef8d30ee780f84c5966649117bcba.jpeg',
    );
    // Price and stock are the live SKUs', not the legacy product columns'.
    expect(xiaomi.price).toBe('2299.00');
    expect(xiaomi.stock).toBe(400);
    // Product 4's two variants differ in price; the cheaper one is the card price.
    expect(products.find((p) => p.id === 4)!.price).toBe('3999.00');

    // The comma list and the helper table are unioned: product 2 has 12, 27, 29
    // on the product row and 12, 29 in the helper, and 27 is not a category
    // this fixture keeps.
    const forTwo = productCategories.filter((m) => m.productId === 2).map((m) => m.categoryId);
    expect(forTwo).toEqual([12, 29]);
    expect(report.categoryLinksDroppedUnknownCategory).toBeGreaterThan(0);
  });

  it('turns the legacy limit pair into a mode and refuses a limit of zero', () => {
    const { products, report } = mapCatalog(baseInput());
    // (1, …, is_limit 1, limit_type 2, limit_num 2)
    expect(products.find((p) => p.id === 1)).toMatchObject({
      purchaseLimitMode: 'lifetime',
      purchaseLimitQuantity: 2,
    });
    // (2, …, is_limit 1, limit_type 1, limit_num 1)
    expect(products.find((p) => p.id === 2)).toMatchObject({
      purchaseLimitMode: 'per_order',
      purchaseLimitQuantity: 1,
    });
    // (3, …, is_limit 0)
    expect(products.find((p) => p.id === 3)).toMatchObject({
      purchaseLimitMode: 'none',
      purchaseLimitQuantity: null,
    });
    expect(report.productsLimitDowngradedToNone).toBe(0);

    const broken = mapCatalog(
      baseInput({
        products: [product({ ...seedProducts[0]!, is_limit: 1, limit_type: 1, limit_num: 0 })],
      }),
    );
    // `products_limit_quantity` would refuse "limited to zero"; legacy meant
    // "not limited".
    expect(broken.products[0]).toMatchObject({
      purchaseLimitMode: 'none',
      purchaseLimitQuantity: null,
    });
    expect(broken.report.productsLimitDowngradedToNone).toBe(1);
  });

  it('maps the three freight modes and falls back when the template is gone', () => {
    const rows = [
      product({ ...seedProducts[0]!, id: 11, spu: 'a', freight: 1, postage: '0.00' }),
      product({ ...seedProducts[0]!, id: 12, spu: 'b', freight: 2, postage: '12.00' }),
      product({ ...seedProducts[0]!, id: 13, spu: 'c', freight: 3, temp_id: 4 }),
      product({ ...seedProducts[0]!, id: 14, spu: 'd', freight: 3, temp_id: 99, postage: '8.00' }),
      product({ ...seedProducts[0]!, id: 15, spu: 'e', freight: 2, is_postage: 1 }),
    ];
    const { products, report } = mapCatalog(
      baseInput({ products: rows, keptShippingTemplateIds: new Set([4]) }),
    );
    expect(products.map((p) => [p.freightMode, p.fixedFreight, p.shippingTemplateId])).toEqual([
      ['free', null, null],
      ['fixed', '12.00', null],
      ['template', null, 4],
      ['fixed', '8.00', null],
      ['free', null, null],
    ]);
    expect(report.productsDowngradedToFixedFreight).toBe(1);
  });

  it('reads the kind off is_virtual + virtual_type, not off virtual_type alone', () => {
    const rows = [
      product({ ...seedProducts[0]!, id: 21, spu: 'a', is_virtual: 0, virtual_type: 0 }),
      product({ ...seedProducts[0]!, id: 22, spu: 'b', is_virtual: 1, virtual_type: 1 }),
      product({ ...seedProducts[0]!, id: 23, spu: 'c', is_virtual: 1, virtual_type: 2 }),
      product({ ...seedProducts[0]!, id: 24, spu: 'd', is_virtual: 1, virtual_type: 3 }),
      // The legacy quirk: `virtual_type` set while `is_virtual` is not. The
      // legacy storefront treated this as a plain product and so does this.
      product({ ...seedProducts[0]!, id: 25, spu: 'e', is_virtual: 0, virtual_type: 1 }),
    ];
    const { products } = mapCatalog(baseInput({ products: rows }));
    expect(products.map((p) => p.kind)).toEqual([
      'physical',
      'virtual_card',
      'virtual_coupon',
      'virtual_manual',
      'physical',
    ]);
  });

  it('keeps a soft-deleted product with its shelf state and a deleted_at', () => {
    const { products, report } = mapCatalog(
      baseInput({ products: [product({ ...seedProducts[0]!, is_del: 1, is_show: 1 })] }),
    );
    // Dropping it would dangle every `order_items.product_id` pointing at it.
    expect(products[0]).toMatchObject({ status: 'on_shelf', deletedAt: MIGRATED_AT });
    expect(report.productsSoftDeleted).toBe(1);
  });

  it('clears a duplicate spu, which legacy allowed and products_spu_uq does not', () => {
    const { products, report } = mapCatalog(
      baseInput({
        products: [
          product({ ...seedProducts[0]!, id: 31, spu: 'SAME' }),
          product({ ...seedProducts[0]!, id: 32, spu: 'SAME' }),
        ],
      }),
    );
    expect(products.map((p) => p.spu)).toEqual(['SAME', null]);
    expect(report.spuCollisionsCleared).toBe(1);
  });

  it('counts the custom form it cannot carry across', () => {
    const { products, report } = mapCatalog(
      baseInput({
        products: [
          product({ ...seedProducts[0]!, id: 41, spu: 'a', custom_form: '[]' }),
          product({
            ...seedProducts[0]!,
            id: 42,
            spu: 'b',
            custom_form: '[{"name":"手机号","type":"input"}]',
          }),
        ],
      }),
    );
    expect(products.every((p) => p.customForm === null)).toBe(true);
    expect(report.productsWithCustomFormDropped).toBe(1);
  });

  it('drops a self-recommendation and one pointing at a product that is gone', () => {
    const { recommendations } = mapCatalog(baseInput());
    // (4, …, recommend_list '1,2,3')
    expect(recommendations.filter((r) => r.productId === 4)).toEqual([
      { productId: 4, recommendedProductId: 1, sortOrder: 0 },
      { productId: 4, recommendedProductId: 2, sortOrder: 1 },
      { productId: 4, recommendedProductId: 3, sortOrder: 2 },
    ]);

    const odd = mapCatalog(
      baseInput({
        products: [product({ ...seedProducts[0]!, id: 1, recommend_list: '1,999' })],
      }),
    );
    expect(odd.recommendations).toEqual([]);
    expect(odd.report.recommendationsDroppedUnknownProduct).toBe(1);
  });
});

describe('mapCatalog: specs and SKUs', () => {
  it('reads only the type = 0 axes, because the others belong to retired activities', () => {
    const { specs, specValues } = mapCatalog(baseInput());
    // Ids 9, 10 (秒杀) and 58 (砍价) are in the fixture and must not appear.
    expect(specs.map((s) => s.id).sort((a, b) => a - b)).toEqual([42, 43, 45, 46, 47, 48, 49, 64]);
    const colour = specs.find((s) => s.id === 47)!;
    expect(colour).toMatchObject({ productId: 4, name: '颜色', sortOrder: 0 });
    expect(specValues.filter((v) => v.specId === 47).map((v) => v.value)).toEqual([
      '深空灰色',
      '紫色',
      '星光色',
      '粉色',
    ]);
  });

  it('builds a SKU per type = 0 variant and names the spec values by axis', () => {
    const { skus } = mapCatalog(baseInput());
    expect(skus.map((s) => s.id).sort((a, b) => a - b)).toEqual([76, 77, 78, 79, 81, 82, 83, 103]);

    const sku = skus.find((s) => s.id === 76)!;
    expect(sku).toMatchObject({
      productId: 1,
      skuCode: 'a1a5e606',
      specText: '冰冰蓝,8+128',
      price: '2299.00',
      originalPrice: '2899.00',
      cost: '2099.00',
      stock: 100,
      barCode: '123123',
      weight: '1.00',
      volume: '1.00',
      isVisible: true,
    });
    expect(sku.specValues).toEqual({ 颜色: '冰冰蓝', 机型: '8+128' });
    expect(skus.find((s) => s.id === 82)!.specValues).toEqual({
      颜色: '深空灰色',
      版本: '64G',
      型号: 'WLAN版',
    });
    // One-axis product 2.
    expect(skus.find((s) => s.id === 103)!.specValues).toEqual({ 颜色: '银色' });
  });

  it('marks exactly one default per product, preferring a visible variant', () => {
    const { skus } = mapCatalog(baseInput());
    for (const productId of [1, 2, 3, 4]) {
      const mine = skus.filter((s) => s.productId === productId);
      expect(mine.filter((s) => s.isDefault)).toHaveLength(1);
    }
    // `product_skus_default_uq` is partial on `is_default`, so two defaults
    // would take the whole batch down.
    const hidden = mapCatalog(
      baseInput({
        attrValues: [
          attrValue({
            id: 76,
            product_id: 1,
            suk: 'a',
            unique: 'x1',
            is_show: 0,
            is_default_select: 1,
          }),
          attrValue({ id: 77, product_id: 1, suk: 'b', unique: 'x2', is_show: 1 }),
        ],
        products: [seedProducts[0]!],
      }),
    );
    expect(hidden.skus.find((s) => s.isDefault)!.id).toBe(77);
  });

  it('drops a duplicate suk and renames a duplicate unique', () => {
    const { skus, report } = mapCatalog(
      baseInput({
        products: [seedProducts[0]!, seedProducts[1]!],
        attrValues: [
          attrValue({ id: 76, product_id: 1, suk: '冰冰蓝,8+128', unique: 'dup' }),
          // Same product, same suk: `product_skus_spec_uq` is new.
          attrValue({ id: 77, product_id: 1, suk: '冰冰蓝,8+128', unique: 'other' }),
          // Different product, same unique: `product_skus_code_uq` is global.
          attrValue({ id: 103, product_id: 2, suk: '银色', unique: 'dup' }),
        ],
      }),
    );
    expect(skus.map((s) => [s.id, s.skuCode])).toEqual([
      [76, 'dup'],
      [103, 'dup-103'],
    ]);
    expect(report.skusDroppedDuplicateSpec).toBe(1);
    expect(report.skuCodeCollisionsRenamed).toBe(1);
  });

  it('gives a product with no variant row one built from its own columns', () => {
    const { skus, report } = mapCatalog(
      baseInput({ products: [seedProducts[0]!], attrValues: [] }),
    );
    // Legacy always wrote one; a product without is broken data, and without a
    // SKU it cannot be bought at all in the new model.
    expect(skus).toHaveLength(1);
    expect(skus[0]).toMatchObject({
      productId: 1,
      specText: '',
      specValues: {},
      price: '2299.00',
      stock: 400,
      isDefault: true,
    });
    expect(report.productsGivenSyntheticSku).toBe(1);
  });

  it('counts the per-SKU columns with nowhere to go', () => {
    const { report } = mapCatalog(
      baseInput({
        products: [seedProducts[0]!],
        attrValues: [
          attrValue({ id: 76, product_id: 1, suk: 'a', unique: 'x1', disk_info: '兑换说明' }),
          attrValue({ id: 77, product_id: 1, suk: 'b', unique: 'x2', coupon_id: 4 }),
        ],
      }),
    );
    expect(report.skusWithDiskInfoDropped).toBe(1);
    expect(report.skusWithCouponIdDropped).toBe(1);
  });
});

describe('mapCatalog: descriptions', () => {
  it('decodes the htmlspecialchars the legacy model decoded on read', () => {
    // Copied out of `INSERT INTO eb_store_product_description` (line 28407).
    const legacy =
      '&lt;p&gt;&lt;img style=&quot;max-width:100%;height:auto;&quot;  src=&quot;http://demo.crmeb.com/uploads/attach/2023/02/20230213/d434773d91b3e3a6b7f4756c0044410a.jpeg&quot;/&gt;&lt;/p&gt;';
    const { descriptions } = mapCatalog(
      baseInput({ descriptions: [{ product_id: 3, description: legacy, type: 0 }] }),
    );
    expect(descriptions).toHaveLength(1);
    expect(descriptions[0]!.contentHtml).toBe(
      '<p><img style="max-width:100%;height:auto;"  src="http://demo.crmeb.com/uploads/attach/2023/02/20230213/d434773d91b3e3a6b7f4756c0044410a.jpeg"/></p>',
    );
    // Not decoding it would put the tags on the page as text.
    expect(descriptions[0]!.contentHtml).not.toContain('&lt;');
  });

  it('unescapes the ampersand last, so &amp;lt; survives as text', () => {
    expect(decodeLegacyHtml('&amp;lt;p&amp;gt;')).toBe('&lt;p&gt;');
  });

  it('ignores the activity copies of a description and an empty body', () => {
    const { descriptions } = mapCatalog(
      baseInput({
        descriptions: [
          { product_id: 1, description: '&lt;p&gt;秒杀&lt;/p&gt;', type: 1 },
          { product_id: 2, description: '   ', type: 0 },
        ],
      }),
    );
    expect(descriptions).toEqual([]);
  });
});

describe('mapCatalog: taxonomy', () => {
  it('collapses duplicate names onto the lowest id and repoints what used them', () => {
    const { labels, labelMap, report } = mapCatalog(
      baseInput({
        products: [product({ ...seedProducts[0]!, label_list: '7,8' })],
        labels: [
          label({ id: 7, name: '新品', sort: 5 }),
          // `product_labels_name_uq` is new; legacy let an operator make it twice.
          label({ id: 8, name: '新品', sort: 3 }),
        ],
      }),
    );
    expect(labels.map((l) => l.id)).toEqual([7]);
    expect(labelMap).toEqual([{ productId: 1, labelId: 7 }]);
    expect(report.nameCollisions).toEqual([
      { table: 'product_labels', name: '新品', keptId: 7, droppedId: 8 },
    ]);
  });

  it('maps a label style, its category and the inverted sort', () => {
    const { labels } = mapCatalog(
      baseInput({
        labelCategories: [{ id: 2, name: '促销', sort: 4, add_time: 1676271495, is_del: 0 }],
        labels: [
          label({
            id: 7,
            name: '图片标',
            cate_id: 2,
            type: 1,
            image: 'http://demo.crmeb.com/x.png',
            sort: 6,
            is_show: 0,
            status: 0,
          }),
        ],
      }),
    );
    expect(labels[0]).toMatchObject({
      categoryId: 2,
      style: 'image',
      imageUrl: 'http://demo.crmeb.com/x.png',
      isVisible: false,
      isEnabled: false,
      sortOrder: -6,
    });
  });

  it('relinks a product parameter to the template that still carries its name', () => {
    const { params, report } = mapCatalog(
      baseInput({
        products: [
          product({
            ...seedProducts[0]!,
            params_list: '[{"name":"品牌","value":"小米"},{"name":"产地","value":"中国"}]',
          }),
        ],
        paramTemplates: [
          { id: 3, name: '品牌', value: '小米\n华为', sort: 2, add_time: 0, status: 1, is_del: 0 },
        ],
      }),
    );
    expect(params).toEqual([
      { id: 1, productId: 1, templateId: 3, name: '品牌', value: '小米', sortOrder: 0 },
      { id: 2, productId: 1, templateId: null, name: '产地', value: '中国', sortOrder: 1 },
    ]);
    expect(report.params).toBe(2);
  });

  it('survives a params_list that is not JSON, and dedupes a repeated name', () => {
    const notJson = mapCatalog(
      baseInput({ products: [product({ ...seedProducts[0]!, params_list: '品牌:小米' })] }),
    );
    expect(notJson.params).toEqual([]);

    const repeated = mapCatalog(
      baseInput({
        products: [
          product({
            ...seedProducts[0]!,
            params_list: '[{"name":"品牌","value":"小米"},{"name":"品牌","value":"红米"}]',
          }),
        ],
      }),
    );
    // `product_params_name_uq` is (product_id, name).
    expect(repeated.params.map((p) => p.value)).toEqual(['小米']);
  });

  it('keeps a protection link and drops one whose badge is gone', () => {
    const { protectionMap, report } = mapCatalog(
      baseInput({
        products: [product({ ...seedProducts[0]!, protection_list: '1,99' })],
        protections: [
          {
            id: 1,
            title: '七天无理由退换',
            content: '商品签收后七天内可申请',
            image: '',
            status: 1,
            sort: 3,
            add_time: 1676271495,
            is_del: 0,
          },
        ],
      }),
    );
    expect(protectionMap).toEqual([{ productId: 1, protectionId: 1 }]);
    expect(report.protectionLinksDroppedUnknownProtection).toBe(1);
  });
});

describe('mapCatalog: card-key stock', () => {
  const cards = [
    {
      id: 1,
      product_id: 1,
      attr_unique: 'a1a5e606',
      card_no: 'C-1',
      card_pwd: 'P-1',
      card_unique: 'k1',
      order_id: '',
      uid: 0,
    },
    {
      id: 2,
      product_id: 1,
      attr_unique: 'a1a5e606',
      card_no: 'C-2',
      card_pwd: 'P-2',
      card_unique: 'k2',
      order_id: '900',
      uid: 5,
    },
    {
      id: 3,
      product_id: 1,
      attr_unique: 'a1a5e606',
      card_no: 'C-3',
      card_pwd: '',
      card_unique: 'k3',
      order_id: '901',
      uid: 6,
    },
    {
      id: 4,
      product_id: 1,
      attr_unique: 'gone',
      card_no: 'C-4',
      card_pwd: '',
      card_unique: 'k4',
      order_id: '',
      uid: 0,
    },
  ];

  it('claims a sold card only when the order line can be named', () => {
    const { virtualCards, report } = mapCatalog(
      baseInput({
        virtuals: cards,
        // The order migration hands back `${legacyOrderId}:${attrUnique}`;
        // order 901 is not in it.
        orderItemIds: new Map([['900:a1a5e606', 5001]]),
      }),
    );
    expect(virtualCards.map((c) => [c.id, c.state, c.orderItemId])).toEqual([
      [1, 'unclaimed', null],
      [2, 'claimed', 5001],
      // Sold, but the line cannot be named: voided, never returned to the
      // pool, because handing it to a second buyer costs real money.
      [3, 'void', null],
    ]);
    expect(virtualCards[1]).toMatchObject({ skuId: 76, productId: 1, claimedByUserId: 5 });
    expect(report.virtualCardsClaimed).toBe(1);
    expect(report.virtualCardsVoidedWithoutOrderItem).toBe(1);
    expect(report.virtualCardsDroppedUnknownSku).toBe(1);
  });

  it('never hands one order line two cards', () => {
    const { virtualCards, report } = mapCatalog(
      baseInput({
        virtuals: [cards[1]!, { ...cards[2]!, order_id: '900' }],
        orderItemIds: new Map([['900:a1a5e606', 5001]]),
      }),
    );
    // `product_virtual_cards_order_item_uq` is partial and unique.
    expect(virtualCards.map((c) => c.state)).toEqual(['claimed', 'void']);
    expect(report.virtualCardsVoidedWithoutOrderItem).toBe(1);
  });

  it('synthesises a card key when the legacy column is blank', () => {
    const { virtualCards } = mapCatalog(
      baseInput({ virtuals: [{ ...cards[0]!, card_unique: '' }] }),
    );
    // `product_virtual_cards_key_uq` has no room for a second empty string.
    expect(virtualCards[0]!.cardKey).toBe('card-1');
    expect(virtualCards[0]!.cardSecret).toBe('P-1');
  });
});

describe('mapCatalog: favourites', () => {
  it('keeps 收藏 of a product and drops 点赞 and the activity catalogues', () => {
    const { favorites, report } = mapCatalog(
      baseInput({
        relations: [
          { uid: 5, product_id: 1, type: 'collect', category: 'product', add_time: 1676280000 },
          { uid: 5, product_id: 1, type: 'like', category: 'product', add_time: 1676280000 },
          // A favourited 秒杀 id is an *activity* id, not a product id.
          { uid: 5, product_id: 1, type: 'collect', category: 'seckill', add_time: 1676280000 },
          { uid: 5, product_id: 999, type: 'collect', category: 'product', add_time: 1676280000 },
          { uid: 9, product_id: 2, type: 'collect', category: 'product', add_time: 1676280000 },
        ],
        keptUserIds: new Set([5]),
      }),
    );
    expect(favorites).toEqual([
      { userId: 5, productId: 1, createdAt: new Date(1676280000 * 1000) },
    ]);
    expect(report.favoritesDroppedNotCollect).toBe(2);
    expect(report.favoritesDroppedUnknownUser).toBe(1);
  });

  it('dedupes the (uid, product) pair the new primary key demands', () => {
    const { favorites } = mapCatalog(
      baseInput({
        relations: [
          { uid: 5, product_id: 1, type: 'collect', category: 'product', add_time: 1676280000 },
          { uid: 5, product_id: 1, type: 'collect', category: '', add_time: 1676290000 },
        ],
      }),
    );
    expect(favorites).toHaveLength(1);
    expect(favorites[0]!.createdAt).toEqual(new Date(1676280000 * 1000));
  });
});

describe('mapCatalog: reviews', () => {
  const written: LegacyProductReply = reply({
    id: 1,
    uid: 5,
    oid: 900,
    unique: 'a1a5e606',
    product_id: 1,
    comment: '手感很好，发货快',
    pics: '["http:\\/\\/demo.crmeb.com\\/uploads\\/a.jpg"]',
    add_time: 1676300000,
    nickname: '小明',
    avatar: 'http://demo.crmeb.com/avatar.png',
    suk: '冰冰蓝,8+128',
    status: 1,
  });

  it('carries the frozen author, the variant and the images across', () => {
    const { reviews } = mapCatalog(
      baseInput({
        replies: [written],
        keptUserIds: new Set([5]),
        keptOrderIds: new Set([900]),
        orderItemIds: new Map([['900:a1a5e606', 5001]]),
      }),
    );
    expect(reviews[0]).toMatchObject({
      id: 1,
      productId: 1,
      skuId: 76,
      userId: 5,
      orderId: 900,
      orderItemId: 5001,
      authorNickname: '小明',
      specText: '冰冰蓝,8+128',
      productScore: 5,
      serviceScore: 5,
      content: '手感很好，发货快',
      status: 'published',
      replyContent: null,
      replyAt: null,
      replyByAdminId: null,
      createdAt: new Date(1676300000 * 1000),
      deletedAt: null,
    });
    expect(reviews[0]!.images).toEqual(['http://demo.crmeb.com/uploads/a.jpg']);
  });

  it('holds an unapproved review for moderation rather than publishing it', () => {
    const { reviews } = mapCatalog(baseInput({ replies: [{ ...written, status: 0 }] }));
    expect(reviews[0]!.status).toBe('pending');
  });

  it('reads 0 as unscored and pins it to the range the CHECK allows', () => {
    const { reviews } = mapCatalog(
      baseInput({ replies: [{ ...written, product_score: 0, service_score: 9 }] }),
    );
    // `product_reviews_scores_range` is 1..5 and the legacy storefront rendered
    // an unscored review as a full five stars.
    expect(reviews[0]).toMatchObject({ productScore: 5, serviceScore: 5 });
  });

  it('keeps the operator reply with a time, even when legacy recorded none', () => {
    const { reviews } = mapCatalog(
      baseInput({
        replies: [
          { ...written, merchant_reply_content: '感谢支持', merchant_reply_time: 0, is_reply: 1 },
        ],
      }),
    );
    expect(reviews[0]).toMatchObject({
      replyContent: '感谢支持',
      // `reply_at` falls back to the review's own time rather than staying null
      // beside a reply that plainly exists.
      replyAt: new Date(1676300000 * 1000),
      replyByAdminId: null,
    });
  });

  it('drops an activity review and one whose product is gone', () => {
    const { reviews, report } = mapCatalog(
      baseInput({
        replies: [
          { ...written, id: 2, reply_type: 'seckill' },
          { ...written, id: 3, product_id: 999 },
          written,
        ],
      }),
    );
    expect(reviews.map((r) => r.id)).toEqual([1]);
    expect(report.reviewsDroppedActivity).toBe(1);
    expect(report.reviewsDroppedUnknownProduct).toBe(1);
  });

  it('gives one order line at most one review and keeps the loser', () => {
    const { reviews, report } = mapCatalog(
      baseInput({
        replies: [written, { ...written, id: 2, comment: '再评一次' }],
        orderItemIds: new Map([['900:a1a5e606', 5001]]),
      }),
    );
    // `product_reviews_order_item_uq` allows one. The second keeps its text —
    // it is somebody's writing — and loses only the link.
    expect(reviews.map((r) => [r.id, r.orderItemId])).toEqual([
      [1, 5001],
      [2, null],
    ]);
    expect(report.reviewsWithoutOrderItem).toBe(1);
  });

  it('soft-deletes rather than drops, so the moderation queue keeps its history', () => {
    const { reviews } = mapCatalog(baseInput({ replies: [{ ...written, is_del: 1 }] }));
    expect(reviews[0]!.deletedAt).toEqual(MIGRATED_AT);
  });
});

describe('mapCatalog: the report', () => {
  it('counts what it wrote and what it could not', () => {
    const { report } = mapCatalog(baseInput());
    expect(report).toMatchObject({
      categories: 6,
      products: 4,
      skus: 8,
      specs: 8,
      productsSoftDeleted: 0,
      productsGivenSyntheticSku: 0,
      nameCollisions: [],
      truncatedFields: [],
    });
    expect(report.specValues).toBe(2 + 2 + 1 + 1 + 4 + 2 + 2 + 1);
  });

  it('records a value it had to cut to fit a narrower column', () => {
    const long = '保'.repeat(80);
    const { protections, report } = mapCatalog(
      baseInput({
        protections: [
          {
            id: 1,
            title: long,
            content: '',
            image: '',
            status: 1,
            sort: 0,
            add_time: 0,
            is_del: 0,
          },
        ],
      }),
    );
    // Legacy `title` is varchar(255); the new column is varchar(64).
    expect(protections[0]!.title).toHaveLength(64);
    expect(report.truncatedFields).toEqual([
      { table: 'product_protections', id: 1, column: 'title', length: 80 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// fixture builders — every default is the legacy column's DDL default
// ---------------------------------------------------------------------------

function product(overrides: Partial<LegacyStoreProduct> & { id: number }): LegacyStoreProduct {
  return {
    store_name: '商品',
    store_info: '',
    keyword: '',
    bar_code: '',
    spu: '',
    cate_id: '',
    image: '',
    recommend_image: '',
    slider_image: '',
    video_link: '',
    unit_name: '',
    price: '0.00',
    ot_price: '0.00',
    cost: '0.00',
    postage: '0.00',
    stock: 0,
    sales: 0,
    ficti: 0,
    browse: 0,
    is_show: 1,
    is_hot: 0,
    is_benefit: 0,
    is_best: 0,
    is_new: 0,
    is_good: 0,
    spec_type: 0,
    virtual_type: 0,
    is_virtual: 0,
    freight: 2,
    is_postage: 0,
    temp_id: 1,
    is_limit: 0,
    limit_type: 0,
    limit_num: 0,
    min_qty: 1,
    sort: 0,
    is_del: 0,
    add_time: 0,
    label_list: '',
    protection_list: '',
    recommend_list: '',
    params_list: '',
    custom_form: '',
    ...overrides,
  };
}

function attrValue(
  overrides: Partial<LegacyProductAttrValue> & { id: number; product_id: number },
): LegacyProductAttrValue {
  return {
    suk: '',
    stock: 100,
    sales: 0,
    price: '2299.00',
    ot_price: '2899.00',
    cost: '2099.00',
    image: P1_IMAGE,
    unique: '',
    bar_code: '123123',
    weight: '1.00',
    volume: '1.00',
    type: 0,
    ...overrides,
  };
}

function label(
  overrides: Partial<LegacyProductLabel> & { id: number; name: string },
): LegacyProductLabel {
  return {
    cate_id: 0,
    type: 0,
    font_color: '',
    bg_color: '',
    border_color: '',
    image: '',
    is_show: 1,
    status: 1,
    sort: 0,
    add_time: 0,
    is_del: 0,
    ...overrides,
  };
}

function reply(overrides: Partial<LegacyProductReply> & { id: number }): LegacyProductReply {
  return {
    uid: 0,
    oid: 0,
    unique: '',
    product_id: 1,
    reply_type: 'product',
    product_score: 5,
    service_score: 5,
    comment: '',
    pics: null,
    add_time: 0,
    merchant_reply_content: '',
    merchant_reply_time: 0,
    is_del: 0,
    is_reply: 0,
    nickname: '',
    avatar: '',
    suk: '',
    status: 1,
    ...overrides,
  };
}
