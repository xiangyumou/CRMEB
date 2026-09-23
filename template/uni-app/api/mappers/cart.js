// cart DTOs → the 购物车 view models.
//
// Contract: next/packages/contracts/src/cart/cart.storefront.contract.ts
//
// `pages/order_addcart` reads `{valid, invalid}` and, per row,
// `{id, product_id, cart_num, truePrice, attrStatus, is_valid, productInfo{…, attrInfo{…}}}`.

import { toId, toInt, money, text, mapList } from './_shared.js';

/** `cartItem` → one 购物车 row. */
export function toPageCartItem(dto) {
  if (!dto) return {};
  const hasSpec = !!text(dto.specText);
  const attrInfo = {
    unique: text(dto.skuId),
    suk: text(dto.specText).split('|').join(','),
    image: text(dto.skuImageUrl || dto.productImageUrl),
    price: money(dto.unitPrice),
    ot_price: money(dto.originalUnitPrice, ''),
    stock: toInt(dto.stock, 0),
    product_id: toId(dto.productId),
  };
  return {
    id: toId(dto.id),
    product_id: toId(dto.productId),
    product_attr_unique: text(dto.skuId),
    cart_num: toInt(dto.quantity, 1),
    truePrice: money(dto.unitPrice),
    trueStock: toInt(dto.stock, 0),
    costPrice: money(dto.originalUnitPrice, ''),
    sum_price: money(dto.subtotal),
    // `attrStatus` drives the tick box; `is_valid` greys the row out.
    attrStatus: dto.available !== false,
    is_valid: dto.available !== false ? 1 : 0,
    invalid_reason: pageInvalidReason(dto.state),
    checked: !!dto.isSelected,
    min_qty: 1,
    productInfo: {
      id: toId(dto.productId),
      store_name: text(dto.productName),
      image: text(dto.productImageUrl),
      price: money(dto.unitPrice),
      ot_price: money(dto.originalUnitPrice, ''),
      stock: toInt(dto.stock, 0),
      unit_name: text(dto.unitName, '件'),
      is_virtual: dto.productKind && dto.productKind !== 'physical' ? 1 : 0,
      // Only multi-spec products carry `attrInfo`, because
      // `mixins/skuSelect.js` branches on `hasOwnProperty('attrInfo')`.
      ...(hasSpec ? { attrInfo } : {}),
      // 门店自提 is retired; the row is always deliverable.
      store_mention: 1,
    },
  };
}

function pageInvalidReason(state) {
  switch (state) {
    case 'deleted':
      return '商品已下架';
    case 'off_shelf':
      return '商品已下架';
    case 'out_of_stock':
      return '库存不足';
    case 'quantity_not_allowed':
      return '购买数量不符合限制';
    default:
      return '';
  }
}

/**
 * `GET /api/v1/cart` → `{valid, invalid}`.
 * One request answers one filter, so only the matching bucket is filled; the page
 * calls the endpoint twice (`status: 1` then `status: 0`) exactly as it did before.
 */
export function toPageCartList(dto) {
  const rows = mapList(dto && dto.items, toPageCartItem);
  return {
    valid: rows.filter((r) => r.is_valid === 1),
    invalid: rows.filter((r) => r.is_valid === 0),
    count: toInt(dto && dto.total, rows.length),
    deduction: null,
  };
}

/** `GET /api/v1/cart` with `filter=all` → the flat list `vcartList` returned. */
export function toPageCartArray(dto) {
  return mapList(dto && dto.items, toPageCartItem);
}

/**
 * `GET /api/v1/cart/count` → `{count, ids}`.
 *
 * `ids` stands for the row ids; the only thing any page reads is `ids.length`, which
 * drives the "fetch every page of the cart" loop in `pages/order_addcart`. The summary
 * DTO carries the row count but not the ids, so `ids` is a filler array of that length.
 */
export function toPageCartCount(dto, numType) {
  const rows = toInt(dto && dto.items, 0);
  const quantity = toInt(dto && dto.quantity, 0);
  return {
    count: numType ? quantity : rows,
    ids: new Array(rows).fill(0),
    valid_count: toInt(dto && dto.availableCount, 0),
    invalid_count: toInt(dto && dto.unavailableCount, 0),
  };
}

/** `POST /api/v1/cart/items` → what `postCartAdd` resolved with. */
export function toPageCartAddResult(dto) {
  const item = dto && dto.item;
  return {
    cartId: item ? toId(item.id) : 0,
    count: toInt(dto && dto.cart && dto.cart.items, 0),
  };
}

/** The page's `{productId, cartNum, uniqueId}` → `POST /api/v1/cart/items` body. */
export function fromPageCartAddInput(data) {
  const src = data || {};
  return {
    skuId: String(src.uniqueId || src.unique || ''),
    quantity: toInt(src.cartNum !== undefined ? src.cartNum : src.num, 1),
  };
}

/** The page's `{page, limit, status}` → `GET /api/v1/cart` query. */
export function fromPageCartQuery(data) {
  const src = data || {};
  const query = {};
  if (src.page !== undefined) query.page = toInt(src.page, 1);
  if (src.limit !== undefined) query.pageSize = toInt(src.limit, 20);
  if (src.status !== undefined && src.status !== '') {
    query.filter = toInt(src.status, 1) === 0 ? 'unavailable' : 'available';
  }
  return query;
}

/** `POST /api/v1/cart/rebuys` → what `orderAgain` resolved with. */
export function toPageRebuyResult(dto) {
  return {
    // The page reads `data.cateId` and navigates to the cart tab with it.
    cateId: 0,
    added: toInt(dto && dto.added, 0),
    skipped: mapList(dto && dto.skippedSkuIds, (id) => toId(id)),
  };
}
