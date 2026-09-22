import { example, exampleBody, assertRenderable } from './helpers.mjs';
import {
  legacyStatusType,
  toLegacyStatus,
  toLegacyOrderItem,
  toLegacyReceiver,
  toLegacyOrderListItem,
  toLegacyOrderList,
  toLegacyOrderPage,
  toLegacyOrderDetail,
  toLegacyOrderCounts,
  fromLegacyOrderListQuery,
  buyNowTicket,
  parseBuyNowTicket,
  fromLegacyCheckoutInput,
  toLegacyOrderConfirm,
  toLegacyCheckoutLine,
  toLegacyOrderComputed,
  fromLegacyOrderCreateInput,
  toLegacyOrderCreateResult,
  toLegacyCashierOrder,
  toLegacyOrderProduct,
} from '../api/mappers/order.js';

const ORDER = example('GET /api/v1/orders/:id');
const LIST = example('GET /api/v1/orders');
const PREVIEW = example('POST /api/v1/checkout/preview');

const withStatus = (over) => ({ ...ORDER, ...over });

describe('legacyStatusType — the single value every order page switches on', () => {
  it('maps the whole lifecycle', () => {
    expect(legacyStatusType(withStatus({ status: 'pending_payment' }))).toBe(0);
    expect(legacyStatusType(withStatus({ status: 'paid', fulfillmentStatus: 'unfulfilled' }))).toBe(1);
    expect(legacyStatusType(withStatus({ status: 'paid', fulfillmentStatus: 'fulfilled' }))).toBe(2);
    expect(legacyStatusType(withStatus({ status: 'shipped' }))).toBe(2);
    expect(legacyStatusType(withStatus({ status: 'received' }))).toBe(3);
    expect(legacyStatusType(withStatus({ status: 'completed' }))).toBe(4);
  });

  it('lets a refund win over the order status', () => {
    expect(legacyStatusType(withStatus({ status: 'paid', refundStatus: 'requested' }))).toBe(-1);
    expect(legacyStatusType(withStatus({ status: 'paid', refundStatus: 'partially_refunded' }))).toBe(-1);
    expect(legacyStatusType(withStatus({ status: 'paid', refundStatus: 'refunded' }))).toBe(-2);
  });

  it('shows a cancelled order as finished, with is_cancel set', () => {
    const cancelled = withStatus({ status: 'cancelled', cancelReason: '超时未支付' });
    expect(legacyStatusType(cancelled)).toBe(4);
    expect(toLegacyOrderListItem(cancelled)).toMatchObject({ is_cancel: 1, paid: 0 });
    expect(toLegacyStatus(cancelled)).toMatchObject({ _title: '已取消', _msg: '超时未支付' });
  });

  it('never produces 9 — offline payment is retired', () => {
    for (const status of ['pending_payment', 'paid', 'shipped', 'received', 'completed', 'cancelled'])
      expect(legacyStatusType(withStatus({ status }))).not.toBe(9);
  });

  it('defaults to 待付款 for an unknown dto', () => {
    expect(legacyStatusType(null)).toBe(0);
    expect(toLegacyStatus(null)._type).toBe(0);
  });

  it('always says 微信支付, the only channel left', () => {
    expect(toLegacyStatus(ORDER)._payType).toBe('微信支付');
  });
});

describe('toLegacyOrderItem', () => {
  const item = toLegacyOrderItem(ORDER.items[0]);

  it('maps a cartInfo row', () => {
    expect(item).toMatchObject({
      id: 7001,
      unique: '7001',
      cart_num: 2,
      refund_num: 0,
      delivery_num: 0,
      truePrice: '60.00',
      sum_price: '110.00',
      product_id: 11,
    });
    expect(item.productInfo).toMatchObject({ store_name: '有机三只松鼠坚果礼盒', unit_name: '盒' });
    assertRenderable(item);
  });

  it('carries attrInfo only when there is a spec', () => {
    expect(item.productInfo.attrInfo).toMatchObject({ unique: '21', suk: '混合装,1000g' });
    const plain = toLegacyOrderItem({ ...ORDER.items[0], specText: '' });
    expect(Object.prototype.hasOwnProperty.call(plain.productInfo, 'attrInfo')).toBe(false);
  });

  it('survives a missing dto', () => {
    expect(toLegacyOrderItem(null)).toEqual({});
  });
});

describe('toLegacyReceiver', () => {
  it('flattens the address into the trio the page prints', () => {
    expect(toLegacyReceiver(ORDER.receiver)).toMatchObject({
      real_name: '张三',
      user_phone: '13800138000',
      user_address: '浙江省 杭州市 西湖区 文三路 100 号 3 单元 501',
      user_address_id: 301,
    });
  });

  it('answers an empty address rather than undefined', () => {
    expect(toLegacyReceiver(null)).toEqual({
      real_name: '',
      user_phone: '',
      user_address: '',
      user_address_id: 0,
    });
  });
});

describe('toLegacyOrderListItem', () => {
  const row = toLegacyOrderListItem(LIST.items[0]);

  it('carries the order number in order_id, which is now routable too (CR-1-h)', () => {
    // CR-1-h was accepted: `/api/v1/orders/:id` takes the surrogate id or the
    // 24-digit number, so the one field the pages both print and route on can
    // be the number the buyer recognises.
    expect(row.order_id).toBe('202602011000000010123456');
    expect(row.order_no).toBe('202602011000000010123456');
    expect(row.trade_no).toBe('202602011000000010123456');
    expect(row.id).toBe(9001);
  });

  it('maps the money and the counts', () => {
    expect(row).toMatchObject({
      id: 9001,
      total_num: 2,
      total_price: '120.00',
      pay_price: '118.00',
      pay_postage: '8.00',
      coupon_price: '10.00',
      paid: 0,
    });
    assertRenderable(row);
  });

  it('renders the timestamps in the offset the server sent', () => {
    expect(row._add_time).toBe('2026-02-01 10:00');
    expect(row.add_time_y).toBe('2026-02-01');
    expect(row.add_time_h).toBe('10:00:00');
    expect(typeof row.add_time).toBe('number');
  });

  it('zeroes every retired activity flag', () => {
    expect(row).toMatchObject({
      seckill_id: 0,
      bargain_id: 0,
      combination_id: 0,
      pink_id: 0,
      advance_id: 0,
      use_integral: 0,
      is_gift: 0,
      shipping_type: 0,
      virtual_type: 0,
    });
  });

  it('tells the page when a refund is still possible', () => {
    expect(toLegacyOrderListItem(withStatus({ status: 'shipped' })).is_refund_available).toBe(true);
    expect(toLegacyOrderListItem(withStatus({ status: 'pending_payment' })).is_refund_available).toBe(false);
  });

  it('maps the list and the counted page', () => {
    expect(toLegacyOrderList(LIST)).toHaveLength(1);
    expect(toLegacyOrderPage(LIST)).toMatchObject({ count: 1 });
    expect(toLegacyOrderList(null)).toEqual([]);
  });
});

describe('toLegacyOrderDetail', () => {
  const detail = toLegacyOrderDetail(ORDER);

  it('folds the receiver into the order row', () => {
    expect(detail).toMatchObject({
      order_id: '202602011000000010123456',
      real_name: '张三',
      mark: '请在工作日送达',
    });
    expect(detail.cartInfo).toHaveLength(1);
    assertRenderable(detail);
  });

  it('turns the null timestamps into 0, not NaN', () => {
    expect(detail).toMatchObject({ pay_time: 0, delivery_time: 0, receive_time: 0, cancel_time: 0 });
  });

  it('survives a missing dto', () => {
    expect(toLegacyOrderDetail(null)).toEqual({});
  });
});

describe('toLegacyOrderCounts', () => {
  it('renames the tab badges', () => {
    expect(toLegacyOrderCounts(example('GET /api/v1/orders/counts'))).toMatchObject({
      order_count: 12,
      unpaid_count: 1,
      unshipped_count: 2,
      received_count: 3,
      complete_count: 5,
      refund_count: 0,
      cancel_count: 1,
    });
  });

  it('zeroes the retired wallet figures the 个人中心 header showed', () => {
    const out = toLegacyOrderCounts(example('GET /api/v1/orders/counts'));
    expect(out).toMatchObject({ sum_price: '0.00', integral_count: 0, coupon_count: 0 });
  });
});

describe('fromLegacyOrderListQuery', () => {
  it('maps every legacy tab index onto a tab name', () => {
    expect(fromLegacyOrderListQuery({ type: 0 }).tab).toBe('unpaid');
    expect(fromLegacyOrderListQuery({ type: 1 }).tab).toBe('unshipped');
    expect(fromLegacyOrderListQuery({ type: 2 }).tab).toBe('unreceived');
    expect(fromLegacyOrderListQuery({ type: 3 }).tab).toBe('finished');
    expect(fromLegacyOrderListQuery({ type: -1 }).tab).toBe('refunding');
    expect(fromLegacyOrderListQuery({ type: '' }).tab).toBe('all');
    expect(fromLegacyOrderListQuery({}).tab).toBe('all');
    expect(fromLegacyOrderListQuery({ type: 'nonsense' }).tab).toBe('all');
  });

  it('renames limit to pageSize and passes the keyword through', () => {
    expect(fromLegacyOrderListQuery({ type: 0, page: 2, limit: 10, search: '苹果' }))
      .toEqual({ page: 2, pageSize: 10, tab: 'unpaid', keyword: '苹果' });
  });
});

describe('the buy-now ticket', () => {
  it('round-trips', () => {
    expect(buyNowTicket('21', 2)).toBe('buynow:21:2');
    expect(parseBuyNowTicket('buynow:21:2')).toEqual({
      skuId: '21',
      quantity: 2,
      kind: 'normal',
      activityId: '',
      groupId: '',
    });
  });

  it('defaults the quantity and rejects anything that is not a ticket', () => {
    expect(parseBuyNowTicket('buynow:21')).toMatchObject({ skuId: '21', quantity: 1 });
    expect(parseBuyNowTicket('5001')).toBeNull();
    expect(parseBuyNowTicket('')).toBeNull();
    expect(parseBuyNowTicket(null)).toBeNull();
  });

  it('carries 拼团 / 预售 through, because the confirm page forwards only cartId', () => {
    expect(buyNowTicket('21', 1, 'groupbuy', '1')).toBe('buynow:21:1:groupbuy:1');
    expect(buyNowTicket('21', 1, 'groupbuy', '1', '501')).toBe('buynow:21:1:groupbuy:1:501');
    expect(buyNowTicket('21', 1, 'groupbuy', '1', 0)).toBe('buynow:21:1:groupbuy:1');
    expect(buyNowTicket('31', 3, 'presale', '2')).toBe('buynow:31:3:presale:2');
    // a kind without an activity is still an ordinary purchase
    expect(buyNowTicket('21', 1, 'groupbuy', '')).toBe('buynow:21:1');
    expect(parseBuyNowTicket('buynow:21:1:groupbuy:1:501')).toEqual({
      skuId: '21',
      quantity: 1,
      kind: 'groupbuy',
      activityId: '1',
      groupId: '501',
    });
    // an unknown kind is not trusted into the body
    expect(parseBuyNowTicket('buynow:21:1:seckill:9').kind).toBe('normal');
  });

  it('makes orderConfirm ask for a buy-now preview instead of a cart one', () => {
    // `checkoutInput` nests the variant; a flat {skuId, quantity} fails the refine.
    expect(fromLegacyCheckoutInput({ cartId: 'buynow:21:2' })).toEqual({
      kind: 'normal',
      source: 'buy-now',
      item: { skuId: '21', quantity: 2 },
    });
  });

  it('turns a 开团 ticket into kind groupbuy with no groupId', () => {
    expect(fromLegacyCheckoutInput({ cartId: 'buynow:21:1:groupbuy:1' })).toEqual({
      kind: 'groupbuy',
      source: 'buy-now',
      item: { skuId: '21', quantity: 1 },
      kindMeta: { activityId: '1' },
    });
  });

  it('takes the team from the ticket or from the confirm page query, either way', () => {
    expect(fromLegacyCheckoutInput({ cartId: 'buynow:21:1:groupbuy:1:501' }).kindMeta).toEqual({
      activityId: '1',
      groupId: '501',
    });
    expect(
      fromLegacyCheckoutInput({ cartId: 'buynow:21:1:groupbuy:1', pinkId: 501 }).kindMeta,
    ).toEqual({ activityId: '1', groupId: '501' });
    // `pinkId` is parseInt'ed to 0 on the 开团 path and must not become a team id
    expect(fromLegacyCheckoutInput({ cartId: 'buynow:21:1:groupbuy:1', pinkId: 0 }).kindMeta).toEqual(
      { activityId: '1' },
    );
  });

  it('never puts a groupId on a 预售 order', () => {
    expect(fromLegacyCheckoutInput({ cartId: 'buynow:31:3:presale:2', pinkId: 7 })).toEqual({
      kind: 'presale',
      source: 'buy-now',
      item: { skuId: '31', quantity: 3 },
      kindMeta: { activityId: '2' },
    });
  });
});

describe('fromLegacyCheckoutInput', () => {
  it('splits the comma-joined cart ids the page passes', () => {
    expect(fromLegacyCheckoutInput({ cartId: '5001,5002', addressId: 301, couponId: 9001 })).toEqual({
      kind: 'normal',
      source: 'cart',
      cartItemIds: ['5001', '5002'],
      addressId: '301',
      userCouponId: '9001',
    });
  });

  it('accepts an array and an empty selection', () => {
    expect(fromLegacyCheckoutInput({ cartId: ['5001'] }).cartItemIds).toEqual(['5001']);
    expect(fromLegacyCheckoutInput({}).cartItemIds).toEqual([]);
  });
});

describe('toLegacyOrderConfirm', () => {
  const confirm = toLegacyOrderConfirm(PREVIEW);

  it('fills cartInfo, priceGroup and addressInfo', () => {
    expect(confirm.cartInfo).toHaveLength(1);
    expect(confirm.priceGroup).toMatchObject({
      totalPrice: '120.00',
      storePostage: '8.00',
      payPrice: '118.00',
    });
    expect(confirm.addressInfo).toMatchObject({ real_name: '张三', user_address_id: 301 });
    expect(confirm.couponPrice).toBe('10.00');
    expect(confirm.discount_id).toBe(9001);
    assertRenderable(confirm);
  });

  it('switches off every retired payment and checkout option', () => {
    expect(confirm).toMatchObject({
      pay_weixin_open: 1,
      yue_pay_status: 0,
      ali_pay_status: 0,
      offline_pay_status: 0,
      friend_pay_status: 0,
      integral_open: 0,
      usable_integral: 0,
      store_self_mention: 0,
      invoice_func: false,
      seckill_id: 0,
      bargain_id: 0,
      combination_id: 0,
      is_gift: 0,
    });
  });

  it('maps a checkout line', () => {
    expect(toLegacyCheckoutLine(PREVIEW.lines[0])).toMatchObject({
      id: 5001,
      item_key: 'sku-21',
      product_id: 11,
      product_attr_unique: '21',
      cart_num: 2,
      truePrice: '60.00',
      sum_price: '110.00',
    });
    expect(toLegacyCheckoutLine(null)).toEqual({});
  });

  it('answers postOrderComputed with only the recomputed prices', () => {
    expect(toLegacyOrderComputed(PREVIEW).result).toMatchObject({
      pay_price: '118.00',
      total_price: '120.00',
      pay_postage: '8.00',
      coupon_price: '10.00',
      deduction_price: '0.00',
      use_integral: 0,
    });
  });

  it('survives a missing dto', () => {
    expect(toLegacyOrderConfirm(null)).toEqual({});
  });
});

describe('order creation', () => {
  it('builds the body the contract example shows', () => {
    const body = fromLegacyOrderCreateInput('ck-20260201-7f3a9b21', {
      cartId: '5001',
      addressId: '301',
      couponId: '9001',
      mark: '请在工作日送达',
      payPrice: '118.00',
    });
    expect(body).toEqual(exampleBody('POST /api/v1/orders'));
  });

  it('maps the created order into the legacy cashier hand-off', () => {
    const out = toLegacyOrderCreateResult(example('POST /api/v1/orders'));
    expect(out.status).toBe('ORDER_CREATE');
    expect(out.result).toMatchObject({
      orderId: '9001',
      order_no: '202602011000000010123456',
      pay_price: '118.00',
    });
    expect(toLegacyOrderCreateResult(null).status).toBe('ORDER_CREATE_ERROR');
  });
});

describe('toLegacyCashierOrder / toLegacyOrderProduct', () => {
  it('gives the cashier the handful of fields it reads', () => {
    expect(toLegacyCashierOrder(ORDER)).toMatchObject({
      oid: 9001,
      order_id: '202602011000000010123456',
      pay_price: '118.00',
      pay_weixin_open: 1,
      yue_pay_status: 0,
      status: 0,
    });
    expect(toLegacyCashierOrder(null)).toEqual({});
  });

  it('picks one order line for the 评价 page', () => {
    expect(toLegacyOrderProduct(ORDER, '7001')).toMatchObject({ cart_num: 2, unique: '7001' });
    expect(toLegacyOrderProduct(ORDER, 'nope')).toEqual({ cart_num: 0, productInfo: {} });
    expect(toLegacyOrderProduct(null, '7001')).toEqual({ cart_num: 0, productInfo: {} });
  });
});
