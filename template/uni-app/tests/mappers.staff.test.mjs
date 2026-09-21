import { example, exampleBody, assertRenderable } from './helpers.mjs';
import {
  toLegacyStaffIdentity,
  toLegacyStaffStatistics,
  legacyStaffStatus,
  toLegacyStaffStatusName,
  toLegacyStaffOrderListItem,
  toLegacyStaffOrderList,
  toLegacyStaffOrderDetail,
  toLegacyOrderTimeline,
  fromLegacyStaffOrderQuery,
  toLegacyExpressCompanies,
  fromLegacyShipInput,
  fromLegacyPriceInput,
  fromLegacyRemarkInput,
  toLegacyStaffRefund,
  toLegacyStaffRefundList,
  fromLegacyStaffRefundQuery,
  fromLegacyRefundReviewInput,
} from '../api/mappers/staff.js';

const ORDERS = example('GET /api/v1/staff/orders');
const ORDER = example('GET /api/v1/staff/orders/:id');
const REFUND = example('GET /api/v1/staff/refunds/:id');

describe('toLegacyStaffIdentity', () => {
  it('answers the 商家管理 entry with a 0/1 flag', () => {
    expect(toLegacyStaffIdentity(example('GET /api/v1/staff/me'))).toEqual({
      is_staff: 1,
      uid: 2001,
      nickname: '张三',
    });
    expect(toLegacyStaffIdentity({ isStaff: false, userId: null, nickname: null })).toEqual({
      is_staff: 0,
      uid: 0,
      nickname: '',
    });
    expect(toLegacyStaffIdentity(null)).toMatchObject({ is_staff: 0 });
  });
});

describe('toLegacyStaffStatistics', () => {
  const census = toLegacyStaffStatistics(example('GET /api/v1/staff/statistics'));

  it('renames the six counters the 首页 tiles bind', () => {
    expect(census).toMatchObject({
      todayPrice: '5320.00',
      proPrice: '6180.00',
      monthPrice: '108400.00',
      todayCount: 48,
      proCount: 51,
      monthCount: 902,
    });
    assertRenderable(census);
  });

  it('carries the three work-queue counters too', () => {
    expect(census).toMatchObject({ unshipped_count: 12, received_count: 30, refund_count: 2 });
  });

  it('survives a missing dto with zeroes, not blanks', () => {
    expect(toLegacyStaffStatistics(null)).toMatchObject({ todayPrice: '0.00', todayCount: 0 });
  });
});

describe('legacyStaffStatus', () => {
  it('reproduces the admin scale the 订单列表 branches on', () => {
    expect(legacyStaffStatus({ status: 'pending_payment' })).toBe(1);
    expect(legacyStaffStatus({ status: 'cancelled' })).toBe(1);
    expect(legacyStaffStatus({ status: 'paid', fulfillmentStatus: 'unfulfilled' })).toBe(2);
    expect(legacyStaffStatus({ status: 'paid', fulfillmentStatus: 'partially_fulfilled' })).toBe(8);
    expect(legacyStaffStatus({ status: 'shipped' })).toBe(4);
    expect(legacyStaffStatus({ status: 'received' })).toBe(5);
    expect(legacyStaffStatus({ status: 'completed' })).toBe(6);
  });

  it('lets a refund outrank the fulfilment state, exactly as the old code did', () => {
    expect(legacyStaffStatus({ status: 'shipped', refundStatus: 'requested' })).toBe(3);
    expect(legacyStaffStatus({ status: 'received', refundStatus: 'refunded' })).toBe(7);
    expect(legacyStaffStatus({ status: 'paid', refundStatus: 'partially_refunded' })).toBe(7);
  });

  it('names each one', () => {
    expect(toLegacyStaffStatusName({ status: 'paid', fulfillmentStatus: 'unfulfilled' })).toEqual({
      status_name: '未发货',
      pics: [],
    });
    expect(toLegacyStaffStatusName({ status: 'cancelled' }).status_name).toBe('已取消');
    expect(toLegacyStaffStatusName(null).status_name).toBe('未支付');
  });
});

describe('toLegacyStaffOrderListItem', () => {
  const row = toLegacyStaffOrderListItem(ORDERS.items[0]);

  it('keeps the shopper fields and adds the ones only staff see', () => {
    expect(row).toMatchObject({
      order_id: '9001',
      pay_price: '118.00',
      total_num: 2,
      _status: 2,
      uid: 2001,
      nickname: '张三',
      phone: '13800138000',
      mark: '请在工作日送达',
      remark: '',
      pay_type: 'weixin',
    });
    expect(row.status_name.status_name).toBe('未发货');
    assertRenderable(row);
  });

  it('builds `_info` and `cart_id`, which decide how the row renders its goods', () => {
    expect(row.cart_id).toEqual([7001]);
    expect(row._info[0].cart_info.productInfo.store_name).toBe('有机三只松鼠坚果礼盒');
  });

  it('pins the retired flags so 拼团 / 自提 / 赠品 branches cannot render', () => {
    expect(row).toMatchObject({ shipping_type: 1, pink_id: 0, pinkStatus: 0, is_gift: 0 });
    expect(row.split).toEqual([]);
  });

  it('marks a refunding order so the row shows 退款中', () => {
    const refunding = toLegacyStaffOrderListItem({ ...ORDERS.items[0], refundStatus: 'requested' });
    expect(refunding._status).toBe(3);
    expect(refunding.refund).toHaveLength(1);
  });

  it('survives a missing dto', () => {
    expect(toLegacyStaffOrderListItem(null)).toEqual({});
    expect(toLegacyStaffOrderList(null)).toEqual([]);
    expect(toLegacyStaffOrderList(ORDERS)).toHaveLength(1);
  });
});

describe('toLegacyStaffOrderDetail', () => {
  const detail = toLegacyStaffOrderDetail(ORDER);

  it('answers `_status` as the **object** form, because the page shares the shopper component', () => {
    expect(detail._status).toMatchObject({ _type: 1 });
    expect(detail._staff_status).toBe(2);
  });

  it('carries the receiver, the remarks and the goods', () => {
    expect(detail).toMatchObject({
      real_name: '张三',
      user_phone: '13800138000',
      user_address: '浙江省 杭州市 西湖区 文三路 100 号 3 单元 501',
      mark: '请在工作日送达',
      remark: '',
      total_num: 2,
    });
    expect(detail.cartInfo).toHaveLength(1);
    assertRenderable(detail);
  });

  it('flattens the newest parcel onto the old delivery_* fields', () => {
    const shipped = toLegacyStaffOrderDetail({
      ...ORDER,
      status: 'shipped',
      fulfillmentStatus: 'fulfilled',
      shipments: [example('GET /api/v1/staff/orders/:id/shipments').items[0]],
    });
    expect(shipped).toMatchObject({
      delivery_type: 'express',
      delivery_id: 'SF1234567890123',
      delivery_name: '顺丰速运',
    });
    expect(shipped.shipments).toHaveLength(1);
  });

  it('survives a missing dto', () => {
    expect(toLegacyStaffOrderDetail(null)).toEqual({});
  });
});

describe('toLegacyOrderTimeline', () => {
  it('maps the 订单记录 entries', () => {
    const logs = toLegacyOrderTimeline(example('GET /api/v1/staff/orders/:id/status-logs'));
    expect(logs[0]).toMatchObject({
      id: 5001,
      change_type: 'shipped',
      change_message: '顺丰速运 SF1234567890123',
      operator: '超级管理员',
    });
    expect(typeof logs[0].add_time).toBe('number');
    expect(toLegacyOrderTimeline(null)).toEqual([]);
  });
});

describe('fromLegacyStaffOrderQuery', () => {
  it('turns the tab index into the contract’s own filter keys', () => {
    expect(fromLegacyStaffOrderQuery({ status: 1, page: 2, limit: 10 })).toEqual({
      page: 2,
      pageSize: 10,
      status: 'paid',
      fulfillmentStatus: 'unfulfilled',
    });
    expect(fromLegacyStaffOrderQuery({ status: 0 })).toEqual({ status: 'pending_payment' });
    expect(fromLegacyStaffOrderQuery({ status: 2 })).toEqual({ status: 'shipped' });
  });

  it('asks for everything when the tab is 全部', () => {
    expect(fromLegacyStaffOrderQuery({ status: '' })).toEqual({});
    expect(fromLegacyStaffOrderQuery(null)).toEqual({});
  });

  it('passes the search box through', () => {
    expect(fromLegacyStaffOrderQuery({ keyword: '张三' })).toEqual({ keyword: '张三' });
  });

  it('parses 按下单时间, which the page posts as two locale clock strings joined by a hyphen', () => {
    const out = fromLegacyStaffOrderQuery({ data: '2026/2/1 00:00:00-2026/2/3 12:30:00' });
    expect(out.createdFrom).toBe(new Date('2026/2/1 00:00:00').toISOString());
    expect(out.createdTo).toBe(new Date('2026/2/3 12:30:00').toISOString());
  });

  it('ignores a range it cannot read rather than sending half a filter', () => {
    expect(fromLegacyStaffOrderQuery({ data: '' })).toEqual({});
    expect(fromLegacyStaffOrderQuery({ data: 'today' })).toEqual({});
    expect(fromLegacyStaffOrderQuery({ data: '2026/2/1 00:00:00-nonsense' })).toEqual({});
  });
});

describe('the 发货 form', () => {
  it('lists the express companies for the picker', () => {
    const rows = toLegacyExpressCompanies(example('GET /api/v1/staff/express-companies'));
    expect(rows[0]).toEqual({ id: '12', code: 'SF', name: '顺丰速运', sort: 100 });
    expect(toLegacyExpressCompanies(null)).toEqual([]);
  });

  it('builds the 快递 body the contract takes', () => {
    const body = fromLegacyShipInput({
      type: 1,
      delivery_code: 'SF',
      delivery_company_id: '12',
      delivery_id: 'SF1234567890123',
    });
    expect(body).toEqual(exampleBody('POST /api/v1/staff/orders/:id/shipments'));
  });

  it('builds the 送货 and 虚拟 bodies from the fields those modes fill in', () => {
    expect(fromLegacyShipInput({ type: 2, sh_delivery_name: '王五', sh_delivery_id: '139' })).toEqual({
      deliveryMode: 'merchant_delivery',
      lines: [],
      courierName: '王五',
      courierPhone: '139',
    });
    expect(fromLegacyShipInput({ type: 3, fictitious_content: '卡密 A' })).toEqual({
      deliveryMode: 'virtual',
      lines: [],
      virtualContent: '卡密 A',
    });
  });

  it('ships the whole order: `lines` is always empty, because 拆单 is gone', () => {
    expect(fromLegacyShipInput({ type: 1, cart_ids: [1, 2] }).lines).toEqual([]);
  });
});

describe('fromLegacyPriceInput', () => {
  it('turns the typed **total** into the discount the contract wants', () => {
    expect(fromLegacyPriceInput({ price: '108.00', pay_price: '118.00' })).toEqual({
      operatorDiscount: '10.00',
    });
    expect(fromLegacyPriceInput(exampleBody('POST /api/v1/staff/orders/:id/price'))).toHaveProperty(
      'operatorDiscount',
    );
  });

  it('refuses to raise the price: a total above the payable is a no-op discount', () => {
    expect(fromLegacyPriceInput({ price: '200.00', pay_price: '118.00' })).toEqual({
      operatorDiscount: '0.00',
    });
    expect(fromLegacyPriceInput({ price: 'abc', pay_price: '118.00' })).toEqual({
      operatorDiscount: '0.00',
    });
    expect(fromLegacyPriceInput(null)).toEqual({ operatorDiscount: '0.00' });
  });

  it('carries the operator’s reason when the form has one', () => {
    expect(fromLegacyPriceInput({ price: '100', pay_price: '118', remark: '老客户' }).reason).toBe('老客户');
  });

  it('builds the 备注 body', () => {
    expect(fromLegacyRemarkInput({ remark: '已电话联系买家' })).toEqual({
      adminRemark: '已电话联系买家',
    });
    expect(fromLegacyRemarkInput(null)).toEqual({ adminRemark: '' });
  });
});

describe('toLegacyStaffRefund', () => {
  const refund = toLegacyStaffRefund(REFUND);

  it('keeps the shopper refund fields and adds the buyer and the return parcel', () => {
    expect(refund).toMatchObject({
      id: 601,
      order_id: '601',
      store_order_sn: 'SO2602261159001',
      refund_price: '99.00',
      refund_num: 1,
      uid: 77,
      nickname: '小明',
      refund_goods_explain: '收到时箱子被压坏，里面有三个苹果烂了',
      remark: '',
    });
    expect(refund.refund_goods_img).toEqual(['https://cdn.example/u/77/refund-601-1.jpg']);
    assertRenderable(refund);
  });

  it('gives the shared 订单 components a cartInfo and a `_status`', () => {
    expect(refund.cartInfo[0]).toMatchObject({ id: 7001, cart_num: 1, truePrice: '99.00' });
    expect(refund._status).toMatchObject({ _type: 3 });
  });

  it('survives a missing dto', () => {
    expect(toLegacyStaffRefund(null)).toEqual({});
    expect(toLegacyStaffRefundList(null)).toEqual([]);
    expect(toLegacyStaffRefundList(example('GET /api/v1/staff/refunds'))).toHaveLength(1);
  });
});

describe('the 售后审核 direction', () => {
  it('maps the 售后列表 tab onto a status', () => {
    expect(fromLegacyStaffRefundQuery({ refundTypes: 0, page: 1, limit: 20 })).toEqual({
      page: 1,
      pageSize: 20,
      status: 'applied',
    });
    expect(fromLegacyStaffRefundQuery({ refundTypes: 2 })).toEqual({ status: 'succeeded' });
    expect(fromLegacyStaffRefundQuery({})).toEqual({});
  });

  it('turns the modal’s `type` into approve / reject', () => {
    expect(fromLegacyRefundReviewInput({ type: 2, refuse_reason: '超过 7 天' })).toEqual({
      decision: 'reject',
      reason: '超过 7 天',
    });
    expect(fromLegacyRefundReviewInput({ type: 1 })).toEqual({ decision: 'approve' });
    expect(fromLegacyRefundReviewInput(null)).toEqual({ decision: 'approve' });
  });

  it('matches the body the contract example posts', () => {
    const body = fromLegacyRefundReviewInput({ type: 1 });
    expect(Object.keys(body)).toEqual(
      Object.keys(exampleBody('POST /api/v1/staff/refunds/:id/review')),
    );
  });
});
