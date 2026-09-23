import { example, exampleBody, assertRenderable } from './helpers.mjs';
import {
  toPageCartItem,
  toPageCartList,
  toPageCartArray,
  toPageCartCount,
  toPageCartAddResult,
  fromPageCartAddInput,
  fromPageCartQuery,
  toPageRebuyResult,
} from '../api/mappers/cart.js';

const CART = example('GET /api/v1/cart');
const ROW = CART.items[0];

describe('toPageCartItem', () => {
  const row = toPageCartItem(ROW);

  it('maps the fields pages/order_addcart reads', () => {
    expect(row).toMatchObject({
      id: 5001,
      product_id: 11,
      product_attr_unique: '21',
      cart_num: 2,
      truePrice: '60.00',
      sum_price: '120.00',
      attrStatus: true,
      is_valid: 1,
      checked: true,
    });
    expect(row.productInfo).toMatchObject({
      store_name: '有机三只松鼠坚果礼盒',
      image: 'https://cdn.example.com/p/11.jpg',
      price: '60.00',
      stock: 42,
      unit_name: '盒',
      store_mention: 1,
    });
    assertRenderable(row);
  });

  it('carries attrInfo only for a multi-spec row, because skuSelect branches on hasOwnProperty', () => {
    expect(Object.prototype.hasOwnProperty.call(row.productInfo, 'attrInfo')).toBe(true);
    expect(row.productInfo.attrInfo).toMatchObject({ unique: '21', suk: '混合装,1000g' });

    const plain = toPageCartItem({ ...ROW, specText: '' });
    expect(Object.prototype.hasOwnProperty.call(plain.productInfo, 'attrInfo')).toBe(false);
  });

  it('greys out an unavailable row and explains why', () => {
    const gone = toPageCartItem({ ...ROW, available: false, state: 'off_shelf' });
    expect(gone).toMatchObject({ is_valid: 0, attrStatus: false, invalid_reason: '商品已下架' });
    expect(toPageCartItem({ ...ROW, available: false, state: 'out_of_stock' }).invalid_reason)
      .toBe('库存不足');
  });

  it('survives a missing dto', () => {
    expect(toPageCartItem(null)).toEqual({});
  });
});

describe('toPageCartList / toPageCartArray', () => {
  it('splits the rows into valid and invalid', () => {
    const out = toPageCartList(CART);
    expect(out.valid).toHaveLength(1);
    expect(out.invalid).toHaveLength(0);
    expect(out.count).toBe(1);
    expect(out.deduction).toBeNull();

    const mixed = toPageCartList({ ...CART, items: [ROW, { ...ROW, id: '5002', available: false }] });
    expect(mixed.valid.map((r) => r.id)).toEqual([5001]);
    expect(mixed.invalid.map((r) => r.id)).toEqual([5002]);
  });

  it('returns a flat array for vcartList and never explodes on a missing payload', () => {
    expect(toPageCartArray(CART)).toHaveLength(1);
    expect(toPageCartArray(null)).toEqual([]);
    expect(toPageCartList(null)).toMatchObject({ valid: [], invalid: [], count: 0 });
  });
});

describe('toPageCartCount', () => {
  const COUNT = example('GET /api/v1/cart/count');

  it('answers rows or quantity depending on numType', () => {
    expect(toPageCartCount(COUNT, false).count).toBe(3);
    expect(toPageCartCount(COUNT, true).count).toBe(5);
  });

  it('fills ids to the row count — every call site only reads ids.length', () => {
    expect(toPageCartCount(COUNT, false).ids).toHaveLength(3);
  });

  it('carries the availability split', () => {
    expect(toPageCartCount(COUNT, false)).toMatchObject({ valid_count: 2, invalid_count: 1 });
    expect(toPageCartCount(null, false)).toMatchObject({ count: 0, ids: [] });
  });
});

describe('toPageCartAddResult / toPageRebuyResult', () => {
  it('returns the new row id', () => {
    expect(toPageCartAddResult(example('POST /api/v1/cart/items'))).toEqual({ cartId: 5001, count: 3 });
    expect(toPageCartAddResult(null)).toEqual({ cartId: 0, count: 0 });
  });

  it('reads the same shape off a decrement, including the removed row', () => {
    // `/cart/items/decrements` answers with `cartMutationResult`, so the minus
    // button on the product page needs no new mapper.
    expect(toPageCartAddResult(example('POST /api/v1/cart/items/decrements')))
      .toEqual({ cartId: 5001, count: 3 });
    expect(toPageCartAddResult({ item: null, cart: { items: 2 } }))
      .toEqual({ cartId: 0, count: 2 });
  });

  it('keeps the cateId the 再次购买 page navigates with', () => {
    const out = toPageRebuyResult(example('POST /api/v1/cart/rebuys'));
    expect(out).toEqual({ cateId: 0, added: 1, skipped: [22] });
  });
});

describe('the fromPage direction', () => {
  it('builds the POST body the contract example shows', () => {
    expect(fromPageCartAddInput({ uniqueId: '21', cartNum: 2 }))
      .toEqual(exampleBody('POST /api/v1/cart/items'));
  });

  it('accepts either page spelling and defaults the quantity', () => {
    expect(fromPageCartAddInput({ unique: '21', num: 3 })).toEqual({ skuId: '21', quantity: 3 });
    expect(fromPageCartAddInput({})).toEqual({ skuId: '', quantity: 1 });
  });

  it('turns status 1/0 into the filter the route takes', () => {
    expect(fromPageCartQuery({ page: 1, limit: 20, status: 1 }))
      .toEqual({ page: 1, pageSize: 20, filter: 'available' });
    expect(fromPageCartQuery({ status: 0 })).toEqual({ filter: 'unavailable' });
    expect(fromPageCartQuery({})).toEqual({});
  });
});
