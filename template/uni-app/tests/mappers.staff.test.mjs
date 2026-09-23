import { example, exampleBody, assertRenderable } from './helpers.mjs';
import {
  toPageStaffIdentity,
  toPageStaffStatistics,
  pageStaffStatus,
  toPageStaffStatusName,
  toPageStaffOrderListItem,
  toPageStaffOrderList,
  toPageStaffOrderDetail,
  toPageOrderTimeline,
  fromPageStaffOrderQuery,
  toPageExpressCompanies,
  fromPageShipInput,
  fromPagePriceInput,
  fromPageRemarkInput,
  toPageStaffRefund,
  toPageStaffRefundList,
  fromPageStaffRefundQuery,
  fromPageRefundReviewInput,
  fromPageRefundRemarkInput,
  shopDayFromUnix,
  fromPageStatisticsRange,
  precedingStatisticsRange,
  toPageStatisticsRows,
  toPageStatisticsChart,
  fromPageStaffProductQuery,
  toPageStaffProduct,
  toPageStaffProductList,
  fromPageLabelAssignment,
  fromPageCategoryAssignment,
  toPageProductLabels,
  toPageProductCategories,
  toPageStaffSkus,
  fromPageSkuPatch,
  toPageTemplateOptions,
  fromPageStaffProductForm,
  fromPageStaffUserQuery,
  toPageStaffUser,
  toPageStaffUserList,
  toPageUserGroups,
  toPageUserLabels,
  fromPageUserGroupInput,
  fromPageUserLabelInput,
} from '../api/mappers/staff.js';

const ORDERS = example('GET /api/v1/staff/orders');
const ORDER = example('GET /api/v1/staff/orders/:id');
const REFUND = example('GET /api/v1/staff/refunds/:id');

describe('toPageStaffIdentity', () => {
  it('answers the 商家管理 entry with a 0/1 flag', () => {
    expect(toPageStaffIdentity(example('GET /api/v1/staff/me'))).toMatchObject({
      is_staff: 1,
      uid: 2001,
      nickname: '张三',
    });
    expect(toPageStaffIdentity({ isStaff: false, userId: null, nickname: null })).toEqual({
      is_staff: 0,
      uid: 0,
      nickname: '',
      refund_review: 0,
      adjust_price: 0,
    });
    expect(toPageStaffIdentity(null)).toMatchObject({
      is_staff: 0,
      refund_review: 0,
      adjust_price: 0,
    });
  });

  // `order-staff.allowStaffRefundReview` is off by default and the review
  // route 403s while it is; the 售后 screens hide 退款审核 / 确认收货 on
  // `refund_review`. It reaches the phone as `abilities.refundReview`.
  describe('refund_review — the 售后 screens follow allowStaffRefundReview', () => {
    const staff = { isStaff: true, userId: '2001', nickname: '张三' };

    it('is on only when the server says the switch is on', () => {
      expect(
        toPageStaffIdentity({ ...staff, abilities: { refundReview: true, adjustPrice: false } }),
      ).toMatchObject({ refund_review: 1 });
    });

    it('is off when the switch is off', () => {
      expect(
        toPageStaffIdentity({ ...staff, abilities: { refundReview: false, adjustPrice: true } }),
      ).toMatchObject({ refund_review: 0 });
    });

    it('is off when the identity does not say — the switch defaults to off', () => {
      expect(toPageStaffIdentity(staff)).toMatchObject({ refund_review: 0 });
      expect(toPageStaffIdentity(example('GET /api/v1/staff/me'))).toMatchObject({
        refund_review: 0,
      });
    });

    it('is never on for someone who is not staff', () => {
      expect(
        toPageStaffIdentity({ ...staff, isStaff: false, abilities: { refundReview: true } }),
      ).toMatchObject({ is_staff: 0, refund_review: 0 });
    });
  });

  // `order-staff.allowStaffRepricing` is off by default and the reprice route
  // 403s while it is; the order list and detail hide 一键改价 on
  // `adjust_price`. It reaches the phone as `abilities.adjustPrice`.
  describe('adjust_price — 一键改价 follows allowStaffRepricing', () => {
    const staff = { isStaff: true, userId: '2001', nickname: '张三' };

    it('is on only when the server says the switch is on', () => {
      expect(
        toPageStaffIdentity({ ...staff, abilities: { refundReview: false, adjustPrice: true } }),
      ).toMatchObject({ adjust_price: 1, refund_review: 0 });
    });

    it('is off when the switch is off', () => {
      expect(
        toPageStaffIdentity({ ...staff, abilities: { refundReview: true, adjustPrice: false } }),
      ).toMatchObject({ adjust_price: 0, refund_review: 1 });
    });

    it('is off when the identity does not say — the switch defaults to off', () => {
      expect(toPageStaffIdentity(staff)).toMatchObject({ adjust_price: 0 });
      expect(toPageStaffIdentity(example('GET /api/v1/staff/me'))).toMatchObject({
        adjust_price: 0,
      });
    });

    it('is never on for someone who is not staff', () => {
      expect(
        toPageStaffIdentity({ ...staff, isStaff: false, abilities: { adjustPrice: true } }),
      ).toMatchObject({ is_staff: 0, adjust_price: 0 });
    });
  });
});

describe('toPageStaffStatistics', () => {
  const census = toPageStaffStatistics(example('GET /api/v1/staff/statistics'));

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
    expect(toPageStaffStatistics(null)).toMatchObject({ todayPrice: '0.00', todayCount: 0 });
  });
});

describe('统计明细', () => {
  const SERIES = example('GET /api/v1/staff/statistics/series');

  it('turns the page’s epoch seconds into the shop’s calendar days', () => {
    // 2026-06-01T16:00:00Z is already 2026-06-02 in Shanghai, wherever the phone is.
    expect(shopDayFromUnix(Date.parse('2026-06-01T15:59:59Z') / 1000)).toBe('2026-06-01');
    expect(shopDayFromUnix(Date.parse('2026-06-01T16:00:00Z') / 1000)).toBe('2026-06-02');
    expect(shopDayFromUnix(Date.parse('2026-06-01T00:00:00Z') / 1000)).toBe('2026-06-01');
    expect(shopDayFromUnix(0)).toBe('');
    expect(shopDayFromUnix(undefined)).toBe('');
  });

  it('leaves an absent end to the server rather than guessing it', () => {
    expect(fromPageStatisticsRange({ page: 1, limit: 15 })).toEqual({ granularity: 'day' });
    expect(
      fromPageStatisticsRange({
        start: Date.parse('2026-02-01T00:00:00Z') / 1000,
        stop: Date.parse('2026-02-03T10:00:00Z') / 1000,
      }),
    ).toEqual({ granularity: 'day', from: '2026-02-01', to: '2026-02-03' });
  });

  it('derives the preceding window of equal length from the answer', () => {
    // 02-01..02-03 is three days, so the window before it is 01-29..01-31.
    expect(precedingStatisticsRange(SERIES)).toEqual({
      granularity: 'day',
      from: '2026-01-29',
      to: '2026-01-31',
    });
    expect(precedingStatisticsRange(null)).toEqual({ granularity: 'day' });
  });

  it('lists the 详细数据 table newest first, without the empty days', () => {
    const rows = toPageStatisticsRows(SERIES, { page: 1, limit: 15 });
    expect(rows).toEqual([
      { time: '02-03', date: '2026-02-03', count: 51, price: '6180.00' },
      { time: '02-01', date: '2026-02-01', count: 48, price: '5320.00' },
    ]);
    assertRenderable(rows);
  });

  it('pages the table client-side, and runs out', () => {
    expect(toPageStatisticsRows(SERIES, { page: 1, limit: 1 })).toHaveLength(1);
    expect(toPageStatisticsRows(SERIES, { page: 2, limit: 1 })[0].time).toBe('02-01');
    expect(toPageStatisticsRows(SERIES, { page: 3, limit: 1 })).toEqual([]);
    expect(toPageStatisticsRows(null, {})).toEqual([]);
  });

  it('charts 营业额 against the previous window', () => {
    const previous = { items: [{ date: '2026-01-31', orderCount: 10, paidAmount: '5000.00' }] };
    const chart = toPageStatisticsChart(SERIES, previous, 1);
    expect(chart.chart).toEqual([
      { time: '2026-02-01', num: '5320.00' },
      { time: '2026-02-02', num: '0.00' },
      { time: '2026-02-03', num: '6180.00' },
    ]);
    expect(chart.time).toBe('11500.00');
    expect(chart.increase_time).toBe('6500.00');
    expect(chart.increase_time_status).toBe(1);
    expect(chart.growth_rate).toBe(130);
    assertRenderable(chart);
  });

  it('charts 订单量 with counts, and marks a fall', () => {
    const previous = { items: [{ date: '2026-01-31', orderCount: 200, paidAmount: '0.00' }] };
    const chart = toPageStatisticsChart(SERIES, previous, 2);
    expect(chart.chart[0]).toEqual({ time: '2026-02-01', num: 48 });
    expect(chart.time).toBe(99);
    expect(chart.increase_time).toBe(101);
    expect(chart.increase_time_status).toBe(2);
    expect(chart.growth_rate).toBe(51);
  });

  it('has no percentage to quote when the previous window was empty', () => {
    const chart = toPageStatisticsChart(SERIES, { items: [] }, 2);
    expect(chart.increase_time_status).toBe(1);
    // The absolute rise, scaled by 100, rather than dividing by zero.
    expect(chart.growth_rate).toBe(9900);
    expect(toPageStatisticsChart(null, null, 1)).toMatchObject({
      chart: [],
      time: '0.00',
      growth_rate: 0,
      increase_time_status: 1,
    });
  });
});

describe('fromPageRefundRemarkInput', () => {
  it('sends `remark`, which is not the console’s `adminRemark`', () => {
    expect(fromPageRefundRemarkInput({ id: 601, remark: '已电话联系买家' })).toEqual({
      remark: '已电话联系买家',
    });
    expect(fromPageRefundRemarkInput(null)).toEqual({ remark: '' });
  });
});

describe('pageStaffStatus', () => {
  it('reproduces the admin scale the 订单列表 branches on', () => {
    expect(pageStaffStatus({ status: 'pending_payment' })).toBe(1);
    expect(pageStaffStatus({ status: 'cancelled' })).toBe(1);
    expect(pageStaffStatus({ status: 'paid', fulfillmentStatus: 'unfulfilled' })).toBe(2);
    expect(pageStaffStatus({ status: 'paid', fulfillmentStatus: 'partially_fulfilled' })).toBe(8);
    expect(pageStaffStatus({ status: 'shipped' })).toBe(4);
    expect(pageStaffStatus({ status: 'received' })).toBe(5);
    expect(pageStaffStatus({ status: 'completed' })).toBe(6);
  });

  it('lets a refund outrank the fulfilment state', () => {
    expect(pageStaffStatus({ status: 'shipped', refundStatus: 'requested' })).toBe(3);
    expect(pageStaffStatus({ status: 'received', refundStatus: 'refunded' })).toBe(7);
    expect(pageStaffStatus({ status: 'paid', refundStatus: 'partially_refunded' })).toBe(7);
  });

  it('names each one', () => {
    expect(toPageStaffStatusName({ status: 'paid', fulfillmentStatus: 'unfulfilled' })).toEqual({
      status_name: '未发货',
      pics: [],
    });
    expect(toPageStaffStatusName({ status: 'cancelled' }).status_name).toBe('已取消');
    expect(toPageStaffStatusName(null).status_name).toBe('未支付');
  });
});

describe('toPageStaffOrderListItem', () => {
  const row = toPageStaffOrderListItem(ORDERS.items[0]);

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
    const refunding = toPageStaffOrderListItem({ ...ORDERS.items[0], refundStatus: 'requested' });
    expect(refunding._status).toBe(3);
    expect(refunding.refund).toHaveLength(1);
  });

  it('survives a missing dto', () => {
    expect(toPageStaffOrderListItem(null)).toEqual({});
    expect(toPageStaffOrderList(null)).toEqual([]);
    expect(toPageStaffOrderList(ORDERS)).toHaveLength(1);
  });
});

describe('toPageStaffOrderDetail', () => {
  const detail = toPageStaffOrderDetail(ORDER);

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

  it('flattens the newest parcel onto the page delivery_* fields', () => {
    const shipped = toPageStaffOrderDetail({
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
    expect(toPageStaffOrderDetail(null)).toEqual({});
  });
});

describe('toPageOrderTimeline', () => {
  it('maps the 订单记录 entries', () => {
    const logs = toPageOrderTimeline(example('GET /api/v1/staff/orders/:id/status-logs'));
    expect(logs[0]).toMatchObject({
      id: 5001,
      change_type: 'shipped',
      change_message: '顺丰速运 SF1234567890123',
      operator: '超级管理员',
    });
    expect(typeof logs[0].add_time).toBe('number');
    expect(toPageOrderTimeline(null)).toEqual([]);
  });
});

describe('fromPageStaffOrderQuery', () => {
  it('turns the tab index into the contract’s own filter keys', () => {
    expect(fromPageStaffOrderQuery({ status: 1, page: 2, limit: 10 })).toEqual({
      page: 2,
      pageSize: 10,
      status: 'paid',
      fulfillmentStatus: 'unfulfilled',
    });
    expect(fromPageStaffOrderQuery({ status: 0 })).toEqual({ status: 'pending_payment' });
    expect(fromPageStaffOrderQuery({ status: 2 })).toEqual({ status: 'shipped' });
  });

  it('asks for everything when the tab is 全部', () => {
    expect(fromPageStaffOrderQuery({ status: '' })).toEqual({});
    expect(fromPageStaffOrderQuery(null)).toEqual({});
  });

  it('passes the search box through', () => {
    expect(fromPageStaffOrderQuery({ keyword: '张三' })).toEqual({ keyword: '张三' });
  });

  it('parses 按下单时间, which the page posts as two locale clock strings joined by a hyphen', () => {
    const out = fromPageStaffOrderQuery({ data: '2026/2/1 00:00:00-2026/2/3 12:30:00' });
    expect(out.createdFrom).toBe(new Date('2026/2/1 00:00:00').toISOString());
    expect(out.createdTo).toBe(new Date('2026/2/3 12:30:00').toISOString());
  });

  it('ignores a range it cannot read rather than sending half a filter', () => {
    expect(fromPageStaffOrderQuery({ data: '' })).toEqual({});
    expect(fromPageStaffOrderQuery({ data: 'today' })).toEqual({});
    expect(fromPageStaffOrderQuery({ data: '2026/2/1 00:00:00-nonsense' })).toEqual({});
  });
});

describe('the 发货 form', () => {
  it('lists the express companies for the picker', () => {
    const rows = toPageExpressCompanies(example('GET /api/v1/staff/express-companies'));
    expect(rows[0]).toEqual({ id: '12', code: 'SF', name: '顺丰速运', sort: 100 });
    expect(toPageExpressCompanies(null)).toEqual([]);
  });

  it('builds the 快递 body the contract takes', () => {
    const body = fromPageShipInput({
      type: 1,
      delivery_code: 'SF',
      delivery_company_id: '12',
      delivery_id: 'SF1234567890123',
    });
    expect(body).toEqual(exampleBody('POST /api/v1/staff/orders/:id/shipments'));
  });

  it('builds the 送货 and 虚拟 bodies from the fields those modes fill in', () => {
    expect(fromPageShipInput({ type: 2, sh_delivery_name: '王五', sh_delivery_id: '139' })).toEqual({
      deliveryMode: 'merchant_delivery',
      lines: [],
      courierName: '王五',
      courierPhone: '139',
    });
    expect(fromPageShipInput({ type: 3, fictitious_content: '卡密 A' })).toEqual({
      deliveryMode: 'virtual',
      lines: [],
      virtualContent: '卡密 A',
    });
  });

  it('ships the whole order: `lines` is always empty, because 拆单 is gone', () => {
    expect(fromPageShipInput({ type: 1, cart_ids: [1, 2] }).lines).toEqual([]);
  });
});

describe('fromPagePriceInput', () => {
  it('turns the typed **total** into the discount the contract wants', () => {
    expect(fromPagePriceInput({ price: '108.00', pay_price: '118.00' })).toEqual({
      operatorDiscount: '10.00',
    });
    expect(fromPagePriceInput(exampleBody('POST /api/v1/staff/orders/:id/price'))).toHaveProperty(
      'operatorDiscount',
    );
  });

  it('refuses to raise the price: a total above the payable is a no-op discount', () => {
    expect(fromPagePriceInput({ price: '200.00', pay_price: '118.00' })).toEqual({
      operatorDiscount: '0.00',
    });
    expect(fromPagePriceInput({ price: 'abc', pay_price: '118.00' })).toEqual({
      operatorDiscount: '0.00',
    });
    expect(fromPagePriceInput(null)).toEqual({ operatorDiscount: '0.00' });
  });

  it('carries the operator’s reason when the form has one', () => {
    expect(fromPagePriceInput({ price: '100', pay_price: '118', remark: '老客户' }).reason).toBe('老客户');
  });

  it('builds the 备注 body', () => {
    expect(fromPageRemarkInput({ remark: '已电话联系买家' })).toEqual({
      adminRemark: '已电话联系买家',
    });
    expect(fromPageRemarkInput(null)).toEqual({ adminRemark: '' });
  });
});

describe('toPageStaffRefund', () => {
  const refund = toPageStaffRefund(REFUND);

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
    expect(toPageStaffRefund(null)).toEqual({});
    expect(toPageStaffRefundList(null)).toEqual([]);
    expect(toPageStaffRefundList(example('GET /api/v1/staff/refunds'))).toHaveLength(1);
  });
});

describe('the 售后审核 direction', () => {
  it('maps the 售后列表 tab onto a status', () => {
    expect(fromPageStaffRefundQuery({ refundTypes: 0, page: 1, limit: 20 })).toEqual({
      page: 1,
      pageSize: 20,
      status: 'applied',
    });
    expect(fromPageStaffRefundQuery({ refundTypes: 2 })).toEqual({ status: 'succeeded' });
    expect(fromPageStaffRefundQuery({})).toEqual({});
  });

  it('turns the modal’s `type` into approve / reject', () => {
    expect(fromPageRefundReviewInput({ type: 2, refuse_reason: '超过 7 天' })).toEqual({
      decision: 'reject',
      reason: '超过 7 天',
    });
    expect(fromPageRefundReviewInput({ type: 1 })).toEqual({ decision: 'approve' });
    expect(fromPageRefundReviewInput(null)).toEqual({ decision: 'approve' });
  });

  it('matches the body the contract example posts', () => {
    const body = fromPageRefundReviewInput({ type: 1 });
    expect(Object.keys(body)).toEqual(
      Object.keys(exampleBody('POST /api/v1/staff/refunds/:id/review')),
    );
  });
});

// ---------------------------------------------------------------------------
// 商品管理
// ---------------------------------------------------------------------------

describe('商品管理', () => {
  const PRODUCTS = example('GET /api/v1/staff/products');
  const SKUS = example('GET /api/v1/staff/products/:id/skus');

  it('turns the four tabs into the state names and drops an empty keyword', () => {
    expect(fromPageStaffProductQuery({ page: 2, limit: 20, store_name: '', type: '' })).toEqual({
      page: 2,
      pageSize: 20,
    });
    expect(fromPageStaffProductQuery({ page: 1, limit: 20, store_name: '白T', type: 1 })).toEqual({
      page: 1,
      pageSize: 20,
      keyword: '白T',
      state: 'on-sale',
    });
    // 仓库中 covers `off_shelf` **and** `draft` on the server (a2.md decision 2)
    expect(fromPageStaffProductQuery({ type: 2 }).state).toBe('in-stock');
    expect(fromPageStaffProductQuery({ type: 4 }).state).toBe('sold-out');
    expect(fromPageStaffProductQuery({ type: 5 }).state).toBe('low-stock');
  });

  it('maps a list row to the snake_case the 商品管理 list renders', () => {
    const row = toPageStaffProduct(PRODUCTS.items[0]);
    expect(row).toMatchObject({
      id: 1,
      store_name: '经典白T恤',
      image: 'https://cdn.example.com/p/1.png',
      price: '59.00',
      stock: 120,
      sales: 33,
      is_show: 1,
      spec_type: 1,
      // 普通商品; the 修改价格/库存 entry is disabled for anything else
      virtual_type: 0,
      unit_name: '件',
      cate_id: '17',
      label_list: '3',
    });
    assertRenderable(row);
  });

  it('gives a single-spec row the attr_value the 修改价格/库存 drawer mounts on', () => {
    // the drawer is `v-if="goodsInfo.attr_value"` and the list route carries no SKU
    const row = toPageStaffProduct({ ...PRODUCTS.items[0], specMode: false });
    expect(row.spec_type).toBe(0);
    // 成本价 / 划线价 stay empty: an empty field is left out of the patch, so it
    // means "leave it alone" rather than "set it to zero"
    expect(row.attr_value).toEqual({ price: '59.00', cost: '', ot_price: '', stock: 120 });
  });

  it('answers a missing payload with a renderable empty row', () => {
    expect(toPageStaffProduct(null)).toEqual({});
    expect(toPageStaffProductList(null)).toEqual({ list: [], count: 0, page: 1, limit: 20 });
  });

  it('pages the list the way the screen does', () => {
    const page = toPageStaffProductList(PRODUCTS);
    expect(page.count).toBe(1);
    expect(page.limit).toBe(20);
    expect(page.list[0].store_name).toBe('经典白T恤');
  });

  it('accepts an id, an array of ids or a comma string for both batch drawers', () => {
    expect(fromPageLabelAssignment({ ids: ['1', '2'], label_list: ['3'] })).toEqual(
      exampleBody('POST /api/v1/staff/products/label-assignments'),
    );
    // the single-product path sets `data.ids = this.goodsInfo.id`
    expect(fromPageLabelAssignment({ ids: 1, label_list: '3,9' })).toEqual({
      productIds: ['1'],
      labelIds: ['3', '9'],
    });
    // an empty label set clears the labels, on purpose
    expect(fromPageLabelAssignment({ ids: ['1'], label_list: [] })).toEqual({
      productIds: ['1'],
      labelIds: [],
    });
    expect(fromPageCategoryAssignment({ ids: ['1', '2'], cate_id: ['17'] })).toEqual(
      exampleBody('POST /api/v1/staff/products/category-assignments'),
    );
  });

  it('groups the labels the way the drawer renders them', () => {
    const groups = toPageProductLabels(example('GET /api/v1/staff/product-labels'));
    expect(groups).toEqual([
      { cate_id: 2, cate_name: '促销', list: [{ id: 3, name: '新品' }] },
      // the trailing null-category group
      { cate_id: 0, cate_name: '未分类', list: [{ id: 9, name: '清仓' }] },
    ]);
    assertRenderable(groups);
  });

  it('renames the category tree to the drawer’s `title`', () => {
    expect(toPageProductCategories(example('GET /api/v1/staff/product-categories'))).toEqual([
      { id: 17, title: '男装', children: [{ id: 18, title: '上衣', children: [] }] },
    ]);
  });

  it('gives a SKU row both `id` and `unique`', () => {
    const rows = toPageStaffSkus(SKUS);
    // `specs.vue` ticks by `id` and saves by `unique` — the same SKU id, twice
    expect(rows[0]).toMatchObject({
      id: 1001,
      unique: '1001',
      suk: '白|M',
      price: '59.00',
      ot_price: '89.00',
      cost: '22.00',
      stock: 60,
    });
    assertRenderable(rows);
  });

  it('sends only the fields the operator filled in', () => {
    // 多规格 saves every row with its own `unique`
    expect(fromPageSkuPatch({ unique: '1001', price: '55.00', cost: '', ot_price: '', stock: '' }))
      .toEqual(exampleBody('PUT /api/v1/staff/products/:id/skus').items[0]);
    // 单规格 has no `unique` on the list row, so `api/admin.js` reads one first
    expect(fromPageSkuPatch({ price: '55.00', stock: 80 }, '1001')).toEqual({
      id: '1001',
      price: '55.00',
      stock: 80,
    });
  });

  it('flattens the 运费模板 options for the picker', () => {
    expect(toPageTemplateOptions(example('GET /api/v1/staff/shipping-templates'))).toEqual([
      { id: 1, name: '全国包邮（满 5 件）', type: 'quantity' },
    ]);
  });

  it('builds the 添加商品 body out of the page form', () => {
    const form = {
      store_name: '手冲挂耳咖啡',
      image: 'https://cdn.example.com/p/44.png',
      slider_image: ['https://cdn.example.com/p/44.png'],
      cate_id: ['17'],
      unit_name: '盒',
      content: '<p><img src="https://cdn.example.com/p/44-detail.png" /></p>',
      is_show: 1,
      // 固定邮费 0 is what the form ships with, and it means 包邮
      freight: 2,
      postage: 0,
      temp_id: 0,
      logistics: ['1', '2'],
      attr: { price: '49.00', cost: '18.00', ot_price: '69.00', stock: 200 },
    };
    expect(fromPageStaffProductForm(form)).toEqual(
      exampleBody('POST /api/v1/staff/products'),
    );
  });

  it('carries the freight choice across, and nothing the mode does not want', () => {
    const base = {
      store_name: 'x',
      image: 'i',
      cate_id: '17',
      unit_name: '件',
      attr: { price: '1.00', stock: 1 },
    };
    const fixed = fromPageStaffProductForm({ ...base, freight: 2, postage: '6.00' });
    expect(fixed.freightMode).toBe('fixed');
    expect(fixed.fixedFreight).toBe('6.00');
    expect(fixed.shippingTemplateId).toBeUndefined();

    const template = fromPageStaffProductForm({ ...base, freight: 3, temp_id: 4 });
    expect(template.freightMode).toBe('template');
    expect(template.shippingTemplateId).toBe('4');
    expect(template.fixedFreight).toBeUndefined();

    // 门店自提 is retired shop-wide: `logistics` is not in the request at all
    expect(fromPageStaffProductForm({ ...base, logistics: ['1', '2'] })).not.toHaveProperty(
      'logistics',
    );
  });
});

// ---------------------------------------------------------------------------
// 用户管理
// ---------------------------------------------------------------------------

describe('用户管理', () => {
  const USERS = example('GET /api/v1/staff/users');
  const USER = example('GET /api/v1/staff/users/:uid');
  const LABELS = example('GET /api/v1/staff/users/:uid/labels');

  it('turns the list page’s query into the contract’s and drops the 全部 zeros', () => {
    expect(
      fromPageStaffUserQuery({ page: 1, limit: 20, nickname: '', group_id: 0, label_id: '' }),
    ).toEqual({ page: 1, pageSize: 20 });
    expect(
      fromPageStaffUserQuery({ page: 2, limit: 20, nickname: ' 小明 ', group_id: 3, label_id: '7' }),
    ).toEqual({ page: 2, pageSize: 20, keyword: '小明', groupId: '3', labelId: '7' });
    // the filter drawer joins a multi-select with commas; the route takes one label
    expect(fromPageStaffUserQuery({ label_id: '7,8' }).labelId).toBe('7');
  });

  it('maps the staff user item to the row and the detail the pages render', () => {
    const row = toPageStaffUser(USER);
    expect(row).toMatchObject({
      uid: 1001,
      nickname: '小明',
      avatar: 'https://cdn.example.com/2026/09/a1b2c3d4.png',
      // always masked — the staff screen never has the full number
      phone: '138****8000',
      status: 1,
      group_id: 3,
      group_name: '高价值客户',
      label_id: [{ id: 7, label_name: '母婴' }],
      order_total_count: 12,
      order_total_price: '3980.00',
      coupon_num: '--',
    });
    expect(row._add_time).toMatch(/^2026-01-05 10:00/);
    // the thin contract: none of the console-only fields are invented
    for (const field of ['real_name', 'birthday', 'card_id', 'addres']) {
      expect(row).not.toHaveProperty(field);
    }
    assertRenderable(row);
  });

  it('renders unknown order stats as 「--」, never as a first-time buyer’s zero', () => {
    const row = toPageStaffUser({ ...USER, orderCount: null, spendTotal: null, groups: [] });
    expect(row.order_total_count).toBe('--');
    expect(row.order_total_price).toBe('--');
    expect(row.group_id).toBe(0);
    expect(row.group_name).toBe('');
  });

  it('pages the list as {list, count}', () => {
    const page = toPageStaffUserList(USERS);
    expect(page.count).toBe(1);
    expect(page.list[0].uid).toBe(1001);
  });

  it('gives the group picker its `group_name`', () => {
    expect(toPageUserGroups(example('GET /api/v1/staff/user-groups'))).toEqual([
      { id: 3, group_name: '高价值客户' },
      { id: 4, group_name: '新客' },
    ]);
  });

  it('groups the labels the way both drawers read them, 未分类 included', () => {
    const groups = toPageUserLabels(LABELS);
    expect(groups).toEqual([
      {
        id: 2,
        name: '消费偏好',
        label: [
          { id: 7, label_name: '母婴', assigned: true },
          { id: 8, label_name: '数码', assigned: false },
        ],
      },
      { id: 0, name: '未分类', label: [{ id: 9, label_name: '未分类标签', assigned: false }] },
    ]);
  });

  it('clears `assigned` when the labels were only borrowed for the catalogue', () => {
    const groups = toPageUserLabels(LABELS, { catalogue: true });
    for (const group of groups) for (const label of group.label) expect(label.assigned).toBe(false);
  });

  it('sends the group body the route accepts, null surviving as null', () => {
    expect(fromPageUserGroupInput(3)).toEqual(exampleBody('POST /api/v1/staff/users/:uid/group'));
    // the string "null" here would be a 422
    expect(fromPageUserGroupInput(null)).toEqual({ groupId: null });
    expect(fromPageUserGroupInput(0)).toEqual({ groupId: null });
  });

  it('sends the label body as an array of id strings', () => {
    expect(fromPageUserLabelInput([7])).toEqual(exampleBody('POST /api/v1/staff/users/:uid/labels'));
    // stringifying the array would give "[object Object],…"
    expect(fromPageUserLabelInput([7, '8'])).toEqual({ labelIds: ['7', '8'] });
    // 取消 all labels is an empty array, not a missing field
    expect(fromPageUserLabelInput([])).toEqual({ labelIds: [] });
  });
});
