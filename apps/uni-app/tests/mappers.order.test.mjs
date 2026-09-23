import { example, exampleBody, assertRenderable } from './helpers.mjs';
import {
  pageStatusType,
  toPageStatus,
  toPageOrderItem,
  toPageReceiver,
  toPageOrderListItem,
  toPageOrderList,
  toPageOrderPage,
  toPageOrderDetail,
  toPageOrderCounts,
  fromPageOrderListQuery,
  buyNowTicket,
  parseBuyNowTicket,
  fromPageCheckoutInput,
  toPageOrderConfirm,
  toPageCheckoutLine,
  toPageOrderComputed,
  fromPageOrderCreateInput,
  toPageOrderCreateResult,
  toPageCashierOrder,
  toPageOrderProduct,
  activityDiscountCents,
  orderActivityDiscountCents,
} from '../api/mappers/order.js';

const ORDER = example('GET /api/v1/orders/:id');
const LIST = example('GET /api/v1/orders');
const PREVIEW = example('POST /api/v1/checkout/preview');

const withStatus = (over) => ({ ...ORDER, ...over });

describe('pageStatusType — the single value every order page switches on', () => {
  it('maps the whole lifecycle', () => {
    expect(pageStatusType(withStatus({ status: 'pending_payment' }))).toBe(0);
    expect(pageStatusType(withStatus({ status: 'paid', fulfillmentStatus: 'unfulfilled' }))).toBe(1);
    expect(pageStatusType(withStatus({ status: 'paid', fulfillmentStatus: 'fulfilled' }))).toBe(2);
    expect(pageStatusType(withStatus({ status: 'shipped' }))).toBe(2);
    expect(pageStatusType(withStatus({ status: 'received' }))).toBe(3);
    expect(pageStatusType(withStatus({ status: 'completed' }))).toBe(4);
  });

  it('lets a refund win over the order status', () => {
    expect(pageStatusType(withStatus({ status: 'paid', refundStatus: 'requested' }))).toBe(-1);
    expect(pageStatusType(withStatus({ status: 'paid', refundStatus: 'partially_refunded' }))).toBe(-1);
    expect(pageStatusType(withStatus({ status: 'paid', refundStatus: 'refunded' }))).toBe(-2);
  });

  it('shows a cancelled order as finished, with is_cancel set', () => {
    const cancelled = withStatus({ status: 'cancelled', cancelReason: '超时未支付' });
    expect(pageStatusType(cancelled)).toBe(4);
    expect(toPageOrderListItem(cancelled)).toMatchObject({ is_cancel: 1, paid: 0 });
    expect(toPageStatus(cancelled)).toMatchObject({ _title: '已取消', _msg: '超时未支付' });
  });

  it('never produces 9 — offline payment is retired', () => {
    for (const status of ['pending_payment', 'paid', 'shipped', 'received', 'completed', 'cancelled'])
      expect(pageStatusType(withStatus({ status }))).not.toBe(9);
  });

  it('defaults to 待付款 for an unknown dto', () => {
    expect(pageStatusType(null)).toBe(0);
    expect(toPageStatus(null)._type).toBe(0);
  });

  it('always says 微信支付, the only channel left', () => {
    expect(toPageStatus(ORDER)._payType).toBe('微信支付');
  });
});

describe('toPageOrderItem', () => {
  const item = toPageOrderItem(ORDER.items[0]);

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

  it('carries attrInfo on every line — a zero-spec line too, with an empty suk', () => {
    expect(item.productInfo.attrInfo).toMatchObject({ unique: '21', suk: '混合装,1000g' });
    // 评价 and 物流 read `attrInfo.price` unguarded; a zero-spec line threw there.
    const plain = toPageOrderItem({ ...ORDER.items[0], specText: '' });
    expect(plain.productInfo.attrInfo).toMatchObject({ unique: '21', suk: '', price: item.productInfo.attrInfo.price });
    assertRenderable(plain);
  });

  it('survives a missing dto', () => {
    expect(toPageOrderItem(null)).toEqual({});
  });
});

describe('toPageReceiver', () => {
  it('flattens the address into the trio the page prints', () => {
    expect(toPageReceiver(ORDER.receiver)).toMatchObject({
      real_name: '张三',
      user_phone: '13800138000',
      user_address: '浙江省 杭州市 西湖区 文三路 100 号 3 单元 501',
      user_address_id: 301,
    });
  });

  it('answers an empty address rather than undefined', () => {
    expect(toPageReceiver(null)).toEqual({
      real_name: '',
      user_phone: '',
      user_address: '',
      user_address_id: 0,
    });
  });
});

describe('toPageOrderListItem', () => {
  const row = toPageOrderListItem(LIST.items[0]);

  it('carries the order number in order_id, which is routable too', () => {
    // `/api/v1/orders/:id` takes the surrogate id or the
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
      virtual_type: 0,
    });
  });

  it('every order is 快递配送, so a paid, unshipped row reads 待发货', () => {
    // order_list: `_status._type == 1 && shipping_type == 1` → 待发货.
    const paid = toPageOrderListItem(withStatus({ status: 'paid', fulfillmentStatus: 'unfulfilled' }));
    expect(paid.shipping_type).toBe(1);
    expect(paid._status._type).toBe(1);
  });

  it('tells the page when a refund is still possible', () => {
    expect(toPageOrderListItem(withStatus({ status: 'shipped' })).is_refund_available).toBe(true);
    expect(toPageOrderListItem(withStatus({ status: 'pending_payment' })).is_refund_available).toBe(false);
  });

  it('maps the list and the counted page', () => {
    expect(toPageOrderList(LIST)).toHaveLength(1);
    expect(toPageOrderPage(LIST)).toMatchObject({ count: 1 });
    expect(toPageOrderList(null)).toEqual([]);
  });
});

describe('toPageOrderDetail', () => {
  const detail = toPageOrderDetail(ORDER);

  it('folds the receiver into the order row', () => {
    expect(detail).toMatchObject({
      order_id: '202602011000000010123456',
      real_name: '张三',
      mark: '请在工作日送达',
    });
    expect(detail.cartInfo).toHaveLength(1);
    assertRenderable(detail);
  });

  it('gives order_details the retired 代付 / 拆单 fields it reads unguarded', () => {
    // `orderInfo.help_info.help_status` and `split.length`: a null here threw on render.
    expect(detail.help_info).toEqual({});
    expect(detail.split).toEqual([]);
    // Fresh per order, so a page that writes into one cannot leak into another.
    const other = toPageOrderDetail(ORDER);
    expect(other.help_info).not.toBe(detail.help_info);
    expect(other.split).not.toBe(detail.split);
  });

  it('turns the null timestamps into 0, not NaN', () => {
    expect(detail).toMatchObject({ pay_time: 0, delivery_time: 0, receive_time: 0, cancel_time: 0 });
  });

  it('survives a missing dto', () => {
    expect(toPageOrderDetail(null)).toEqual({});
  });
});

describe('toPageOrderCounts', () => {
  it('renames the tab badges', () => {
    expect(toPageOrderCounts(example('GET /api/v1/orders/counts'))).toMatchObject({
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
    const out = toPageOrderCounts(example('GET /api/v1/orders/counts'));
    expect(out).toMatchObject({ sum_price: '0.00', integral_count: 0, coupon_count: 0 });
  });
});

describe('fromPageOrderListQuery', () => {
  it('maps every page tab index onto a tab name', () => {
    expect(fromPageOrderListQuery({ type: 0 }).tab).toBe('unpaid');
    expect(fromPageOrderListQuery({ type: 1 }).tab).toBe('unshipped');
    expect(fromPageOrderListQuery({ type: 2 }).tab).toBe('unreceived');
    expect(fromPageOrderListQuery({ type: 3 }).tab).toBe('finished');
    expect(fromPageOrderListQuery({ type: -1 }).tab).toBe('refunding');
    // The 全部 tab is `orderStatus 9`.
    expect(fromPageOrderListQuery({ type: 9 }).tab).toBe('all');
    expect(fromPageOrderListQuery({ type: '' }).tab).toBe('all');
    expect(fromPageOrderListQuery({}).tab).toBe('all');
    expect(fromPageOrderListQuery({ type: 'nonsense' }).tab).toBe('all');
  });

  it('renames limit to pageSize and passes the keyword through', () => {
    expect(fromPageOrderListQuery({ type: 0, page: 2, limit: 10, search: '苹果' }))
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
    expect(fromPageCheckoutInput({ cartId: 'buynow:21:2' })).toEqual({
      kind: 'normal',
      source: 'buy-now',
      item: { skuId: '21', quantity: 2 },
    });
  });

  it('turns a 开团 ticket into kind groupbuy with no groupId', () => {
    expect(fromPageCheckoutInput({ cartId: 'buynow:21:1:groupbuy:1' })).toEqual({
      kind: 'groupbuy',
      source: 'buy-now',
      item: { skuId: '21', quantity: 1 },
      kindMeta: { activityId: '1' },
    });
  });

  it('takes the team from the ticket or from the confirm page query, either way', () => {
    expect(fromPageCheckoutInput({ cartId: 'buynow:21:1:groupbuy:1:501' }).kindMeta).toEqual({
      activityId: '1',
      groupId: '501',
    });
    expect(
      fromPageCheckoutInput({ cartId: 'buynow:21:1:groupbuy:1', pinkId: 501 }).kindMeta,
    ).toEqual({ activityId: '1', groupId: '501' });
    // `pinkId` is parseInt'ed to 0 on the 开团 path and must not become a team id
    expect(fromPageCheckoutInput({ cartId: 'buynow:21:1:groupbuy:1', pinkId: 0 }).kindMeta).toEqual(
      { activityId: '1' },
    );
  });

  it('never puts a groupId on a 预售 order', () => {
    expect(fromPageCheckoutInput({ cartId: 'buynow:31:3:presale:2', pinkId: 7 })).toEqual({
      kind: 'presale',
      source: 'buy-now',
      item: { skuId: '31', quantity: 3 },
      kindMeta: { activityId: '2' },
    });
  });
});

describe('fromPageCheckoutInput', () => {
  it('splits the comma-joined cart ids the page passes', () => {
    expect(fromPageCheckoutInput({ cartId: '5001,5002', addressId: 301, couponId: 9001 })).toEqual({
      kind: 'normal',
      source: 'cart',
      cartItemIds: ['5001', '5002'],
      addressId: '301',
      userCouponId: '9001',
    });
  });

  it('accepts an array and an empty selection', () => {
    expect(fromPageCheckoutInput({ cartId: ['5001'] }).cartItemIds).toEqual(['5001']);
    expect(fromPageCheckoutInput({}).cartItemIds).toEqual([]);
  });
});

describe('toPageOrderConfirm', () => {
  const confirm = toPageOrderConfirm(PREVIEW);

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
    expect(toPageCheckoutLine(PREVIEW.lines[0])).toMatchObject({
      id: 5001,
      item_key: 'sku-21',
      product_id: 11,
      product_attr_unique: '21',
      cart_num: 2,
      truePrice: '60.00',
      sum_price: '110.00',
    });
    expect(toPageCheckoutLine(null)).toEqual({});
  });

  it('answers postOrderComputed with only the recomputed prices', () => {
    expect(toPageOrderComputed(PREVIEW).result).toMatchObject({
      pay_price: '118.00',
      total_price: '120.00',
      pay_postage: '8.00',
      coupon_price: '10.00',
      deduction_price: '0.00',
      use_integral: 0,
    });
  });

  it('survives a missing dto', () => {
    expect(toPageOrderConfirm(null)).toEqual({});
  });

  it('配送运费 has a freight discount to add, so it is never ¥NaN', () => {
    // The template renders `storePostage + storePostageDiscount`.
    const confirm = toPageOrderConfirm(PREVIEW);
    expect(confirm.priceGroup.storePostageDiscount).toBe('0.00');
    expect(Number(confirm.priceGroup.storePostage) + Number(confirm.priceGroup.storePostageDiscount)).toBe(8);
    // `computedPrice()` copies it from the recomputed result onto priceGroup.
    expect(toPageOrderComputed(PREVIEW).result.storePostageDiscount).toBe('0.00');
  });
});

describe('order creation', () => {
  it('builds the body the contract example shows', () => {
    const body = fromPageOrderCreateInput('ck-20260201-7f3a9b21', {
      cartId: '5001',
      addressId: '301',
      couponId: '9001',
      mark: '请在工作日送达',
      payPrice: '118.00',
    });
    expect(body).toEqual(exampleBody('POST /api/v1/orders'));
  });

  it('a product without a custom form sends no customForm (the page passes [])', () => {
    const body = fromPageOrderCreateInput('ck-20260201-7f3a9b21', { cartId: '5001', custom_form: [] });
    expect(body).not.toHaveProperty('customForm');
    expect(body.cartItemIds).toEqual(['5001']);
  });

  it('the page`s field list becomes the contract`s { key: answer } record', () => {
    const body = fromPageOrderCreateInput('ck-20260201-7f3a9b21', {
      cartId: '5001',
      custom_form: [
        { key: 'name', label: '姓名', type: 'text', value: '张三' },
        { key: 'size', label: '尺码', type: 'radio', value: 'L' },
        { key: 'note', label: '备注', type: 'text', value: '' },
        { key: 'tags', label: '标签', type: 'checkbox', value: [] },
        { label: '无键', value: 'x' },
      ],
    });
    expect(body.customForm).toEqual({ name: '张三', size: 'L' });
    // A record the page already built passes as is.
    expect(fromPageOrderCreateInput('ck-20260201-7f3a9b21', { cartId: '1', custom_form: { a: 1 } }).customForm).toEqual({
      a: 1,
    });
  });

  it('maps the created order into the cashier hand-off', () => {
    const out = toPageOrderCreateResult(example('POST /api/v1/orders'));
    expect(out.status).toBe('ORDER_CREATE');
    expect(out.result).toMatchObject({
      orderId: '9001',
      order_no: '202602011000000010123456',
      pay_price: '118.00',
    });
    expect(toPageOrderCreateResult(null).status).toBe('ORDER_CREATE_ERROR');
  });
});

describe('toPageCashierOrder / toPageOrderProduct', () => {
  it('gives the cashier the handful of fields it reads', () => {
    expect(toPageCashierOrder(ORDER)).toMatchObject({
      oid: 9001,
      order_id: '202602011000000010123456',
      pay_price: '118.00',
      pay_weixin_open: 1,
      yue_pay_status: 0,
      status: 0,
    });
    expect(toPageCashierOrder(null)).toEqual({});
  });

  it('picks one order line for the 评价 page', () => {
    expect(toPageOrderProduct(ORDER, '7001')).toMatchObject({ cart_num: 2, unique: '7001' });
    expect(toPageOrderProduct(ORDER, 'nope')).toEqual({ cart_num: 0, productInfo: {} });
    expect(toPageOrderProduct(null, '7001')).toEqual({ cart_num: 0, productInfo: {} });
  });
});

// 预售 / 拼团: checkout keeps the catalogue price on the line and prices the activity
// as a `*:activity-price` adjustment folded into `couponDiscount`. These are the
// shapes the real stack answered for a ¥88 SKU in a ¥78 预售.
describe('活动价 — the activity price is what the pages print', () => {
  const line = {
    ...PREVIEW.lines[0],
    quantity: 1,
    unitPrice: '88.00',
    originalUnitPrice: null,
    subtotal: '88.00',
    discountAmount: '10.00',
    totalAmount: '78.00',
    specText: '',
  };
  const presalePreview = {
    ...PREVIEW,
    lines: [line],
    itemsAmount: '88.00',
    freightAmount: '0.00',
    couponDiscount: '10.00',
    adjustments: [{ source: 'presale:activity-price', label: '预售价（E2E 预售活动）', amount: '-10.00' }],
    payableAmount: '78.00',
    userCouponId: null,
    totalQuantity: 1,
  };
  // What the server writes for a 预售 line: the catalogue price,
  // and the activity named among the line's adjustments.
  const ACTIVITY = { source: 'presale:activity-price', label: '预售价（E2E 预售活动）', amount: '-10.00' };
  const orderItem = {
    ...ORDER.items[0],
    quantity: 1,
    unitPrice: '88.00',
    originalUnitPrice: null,
    discountAmount: '10.00',
    totalAmount: '78.00',
    specText: '',
    adjustments: [ACTIVITY],
  };
  const presaleOrder = {
    ...ORDER,
    kind: 'presale',
    items: [orderItem],
    totalQuantity: 1,
    itemsAmount: '88.00',
    freightAmount: '0.00',
    couponDiscount: '10.00',
    payableAmount: '78.00',
    paidAmount: '78.00',
    userCouponId: null,
  };

  it('sums only activity-price adjustments', () => {
    expect(activityDiscountCents(presalePreview.adjustments)).toBe(1000);
    expect(
      activityDiscountCents([
        { source: 'groupbuy:activity-price', amount: '-12.50' },
        { source: 'coupon:full-reduction', amount: '-5.00' },
      ]),
    ).toBe(1250);
    expect(activityDiscountCents(PREVIEW.adjustments)).toBe(0);
    expect(activityDiscountCents(undefined)).toBe(0);
  });

  it('confirm page: ¥78 unit price, ¥78 商品总价, no phantom coupon, ¥88 struck through', () => {
    const view = toPageOrderConfirm(presalePreview);
    expect(view.cartInfo[0]).toMatchObject({ truePrice: '78.00', costPrice: '88.00', sum_price: '78.00' });
    expect(view.cartInfo[0].productInfo.price).toBe('78.00');
    expect(view.priceGroup).toMatchObject({ totalPrice: '78.00', costPrice: '78.00', payPrice: '78.00' });
    expect(view.couponPrice).toBe('0.00');
    expect(toPageOrderComputed(presalePreview).result).toMatchObject({
      total_price: '78.00',
      coupon_price: '0.00',
      pay_price: '78.00',
    });
  });

  it('confirm page: a stacked coupon stays a coupon', () => {
    const view = toPageOrderConfirm({
      ...presalePreview,
      couponDiscount: '15.00',
      adjustments: [...presalePreview.adjustments, { source: 'coupon:full-reduction', label: '减 5', amount: '-5.00' }],
      payableAmount: '73.00',
      userCouponId: '9001',
    });
    expect(view.cartInfo[0].truePrice).toBe('78.00');
    expect(view.priceGroup.totalPrice).toBe('78.00');
    expect(view.couponPrice).toBe('5.00');
  });

  it('confirm page: the activity price spreads over the quantity', () => {
    const view = toPageOrderConfirm({
      ...presalePreview,
      lines: [{ ...line, quantity: 2, subtotal: '176.00', discountAmount: '20.00', totalAmount: '156.00' }],
      itemsAmount: '176.00',
      couponDiscount: '20.00',
      adjustments: [{ source: 'presale:activity-price', label: '预售价', amount: '-20.00' }],
    });
    expect(view.cartInfo[0].truePrice).toBe('78.00');
    expect(view.priceGroup.totalPrice).toBe('156.00');
  });

  it('a normal preview is untouched', () => {
    const view = toPageOrderConfirm(PREVIEW);
    expect(view.priceGroup.totalPrice).toBe(PREVIEW.itemsAmount);
    expect(view.couponPrice).toBe(PREVIEW.couponDiscount);
    expect(view.cartInfo[0].truePrice).toBe(PREVIEW.lines[0].unitPrice);
  });

  it('order detail: an activity order without a coupon prints the activity price', () => {
    expect(orderActivityDiscountCents(presaleOrder)).toBe(1000);
    const detail = toPageOrderDetail(presaleOrder);
    expect(detail).toMatchObject({ total_price: '78.00', coupon_price: '0.00', pay_price: '78.00' });
    expect(detail.cartInfo[0]).toMatchObject({ truePrice: '78.00', sum_price: '78.00' });
    expect(detail.cartInfo[0].productInfo.price).toBe('78.00');
    expect(detail.cartInfo[0].productInfo.attrInfo.price).toBe('78.00');
    expect(JSON.stringify(detail)).not.toContain('88.00');
  });

  it('order detail: a normal order is untouched', () => {
    expect(ORDER.items[0].adjustments.map((a) => a.source)).toEqual(['coupon:full-reduction']);
    expect(orderActivityDiscountCents(ORDER)).toBe(0);
    expect(toPageOrderDetail(ORDER).cartInfo[0].truePrice).toBe(ORDER.items[0].unitPrice);
    expect(toPageOrderDetail(ORDER).coupon_price).toBe(ORDER.couponDiscount);
  });

  it('the 订单列表 prints the activity price too — a list row reads its lines', () => {
    const { userCouponId, ...row } = presaleOrder;
    expect(userCouponId).toBeNull();
    expect(orderActivityDiscountCents(row)).toBe(1000);
    expect(toPageOrderListItem(row, 3)).toMatchObject({ total_price: '78.00', coupon_price: '0.00' });
    expect(toPageOrderListItem(row, 3).cartInfo[0].truePrice).toBe('78.00');
    expect(toPageOrderList({ items: [row, row] })[1].cartInfo[0].truePrice).toBe('78.00');
  });

  it('a line with no recorded adjustments: only a coupon-free detail can be derived', () => {
    const older = { ...presaleOrder, items: [{ ...orderItem, adjustments: [] }] };
    expect(orderActivityDiscountCents(older)).toBe(1000);
    expect(toPageOrderDetail(older).cartInfo[0].truePrice).toBe('78.00');
    expect(orderActivityDiscountCents({ ...older, userCouponId: '9001' })).toBe(0);
    const { userCouponId, ...row } = older;
    expect(userCouponId).toBeNull();
    expect(orderActivityDiscountCents(row)).toBe(0);
    expect(toPageOrderListItem(row, 3).cartInfo[0].truePrice).toBe('88.00');
  });

  // Each order line carries what every checkout rule took off it, so
  // once a coupon stacks on a 预售 the ¥10 activity and the ¥5 coupon are still
  // two entries, and the page prints ¥78 and a ¥5 优惠券.
  it('a 预售 order with a stacked coupon still prints ¥78', () => {
    const detail = toPageOrderDetail({
      ...presaleOrder,
      items: [
        {
          ...orderItem,
          discountAmount: '15.00',
          totalAmount: '73.00',
          adjustments: [ACTIVITY, { source: 'coupon:discount', label: '优惠券抵扣', amount: '-5.00' }],
        },
      ],
      couponDiscount: '15.00',
      payableAmount: '73.00',
      paidAmount: '73.00',
      userCouponId: '9001',
    });
    expect(detail.cartInfo[0].truePrice).toBe('78.00');
    expect(detail).toMatchObject({ total_price: '78.00', coupon_price: '5.00', pay_price: '73.00' });
  });
});
