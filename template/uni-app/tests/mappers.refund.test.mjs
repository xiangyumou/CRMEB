import { example, exampleBody, assertRenderable } from './helpers.mjs';
import {
  pageRefundType,
  toPageRefundLine,
  toPageRefund,
  toPageRefundList,
  toPageRefundReasons,
  toPageApplicableItems,
  fromPageRefundApplyInput,
  fromPageReturnShipmentInput,
  fromPageRefundState,
} from '../api/mappers/refund.js';

const REFUND = example('GET /api/v1/refunds/:id');
const APPLICABLE = example('GET /api/v1/refunds/applicable-items/:orderId');

describe('pageRefundType — the numbers the pages stamp (1–6)', () => {
  it('maps every status onto the refund_type the pages branch on', () => {
    expect(pageRefundType('applied')).toBe(1);
    expect(pageRefundType('applied', null, 'refund_only')).toBe(1);
    expect(pageRefundType('applied', null, 'return_and_refund')).toBe(2);
    expect(pageRefundType('rejected')).toBe(3);
    expect(pageRefundType('approved')).toBe(4);
    expect(pageRefundType('returned')).toBe(5);
    expect(pageRefundType('refunding')).toBe(5);
    expect(pageRefundType('succeeded')).toBe(6);
    expect(pageRefundType('cancelled')).toBe(0);
    expect(pageRefundType('closed')).toBe(0);
  });

  it('moves an approved refund to 退货待收货 once the buyer has shipped it back', () => {
    expect(pageRefundType('approved', 'awaiting_shipment')).toBe(4);
    expect(pageRefundType('approved', 'shipped_back')).toBe(5);
  });

  it('stamps nothing for an unknown status', () => {
    expect(pageRefundType('who-knows')).toBe(0);
    expect(pageRefundType(undefined)).toBe(0);
  });

  it('a succeeded refund gets user_return_list`s 已退款 stamp (refund_type 6)', () => {
    expect(toPageRefund({ ...REFUND, status: 'succeeded' }).refund_type).toBe(6);
  });
});

describe('toPageRefund', () => {
  const refund = toPageRefund(REFUND);

  it('maps the fields the 退款详情 page reads', () => {
    expect(refund).toMatchObject({
      id: 601,
      order_id: '601',
      refund_order_id: 'RF2602261300000601',
      store_order_id: '3001',
      order_no: 'SO2602261159001',
      refund_type: 2,
      _type: 2,
      _msg: '等待商家处理',
      refund_num: 1,
      refund_price: '99.00',
      refunded_price: '0.00',
      refund_reason: '商品破损',
      refund_kind: 1,
      is_refund_freight: 0,
    });
    assertRenderable(refund);
  });

  it('mirrors _status so components shared with the order pages keep working', () => {
    expect(refund._status).toMatchObject({ _type: 2, _title: '等待商家处理' });
  });

  it('carries the evidence and the audit log', () => {
    expect(refund.refund_img).toEqual(['https://cdn.example/u/77/refund-601-1.jpg']);
    expect(refund.logs[0]).toMatchObject({
      status: 'applied',
      msg: '买家发起退款申请',
      _add_time: '2026-02-26 13:00:00',
    });
  });

  it('turns the null return-shipment fields into empty strings and a null address', () => {
    expect(refund).toMatchObject({
      delivery_id: '',
      delivery_name: '',
      delivery_code: '',
      refund_address: null,
      success_time: 0,
    });
  });

  it('maps a line', () => {
    expect(toPageRefundLine(REFUND.items[0])).toMatchObject({
      id: 7001,
      unique: '7001',
      cart_num: 1,
      truePrice: '99.00',
    });
    expect(toPageRefundLine(null)).toEqual({});
  });

  it('survives a missing dto', () => {
    expect(toPageRefund(null)).toEqual({});
  });
});

describe('toPageRefundList / toPageRefundReasons', () => {
  it('returns the counted page', () => {
    expect(toPageRefundList(example('GET /api/v1/refunds'))).toMatchObject({ page: 1 });
    expect(toPageRefundList(null)).toMatchObject({ list: [], count: 0 });
  });

  it('flattens the reasons to strings for the picker', () => {
    expect(toPageRefundReasons(example('GET /api/v1/refund-reasons'))).toEqual([
      '不想要了',
      '商品破损',
      '与描述不符',
      '少件/漏发',
      '质量问题',
      '其他',
    ]);
    expect(toPageRefundReasons(null)).toEqual([]);
  });
});

describe('toPageApplicableItems', () => {
  const out = toPageApplicableItems(APPLICABLE);

  it('carries the order totals the 申请退款 header shows', () => {
    expect(out).toMatchObject({
      order_id: '3001',
      order_no: 'SO2602261159001',
      pay_price: '99.00',
      refunded_price: '0.00',
      refundable_price: '99.00',
      freight_refundable: false,
    });
    assertRenderable(out);
  });

  it('gives each line the stepper state the page mutates', () => {
    expect(out.cartInfo[0]).toMatchObject({
      id: 7001,
      unique: '7001',
      cart_num: 1,
      refund_num: 0,
      surplus_num: 1,
      numShow: 1,
      checked: false,
      textarea: '',
      truePrice: '99.00',
    });
  });

  it('survives a missing dto', () => {
    expect(toPageApplicableItems(null)).toMatchObject({ cartInfo: [], order_id: '' });
  });
});

describe('the fromPage direction', () => {
  it('builds the apply body from the page state', () => {
    const body = fromPageRefundApplyInput('3001', {
      refund_type: 2,
      cart_ids: [{ cart_id: 7001, cart_num: 1 }],
      text: '商品破损',
      explain: '收到时箱子被压坏',
      refund_img: ['https://cdn.example/u/77/refund-601-1.jpg'],
      is_refund_freight: false,
    });
    expect(body).toEqual({
      orderId: '3001',
      kind: 'return_and_refund',
      lines: [{ orderItemId: '7001', quantity: 1 }],
      reason: '商品破损',
      explanation: '收到时箱子被压坏',
      images: ['https://cdn.example/u/77/refund-601-1.jpg'],
      includeFreight: false,
    });
  });

  it('is a refund_only application when the page refund_type is 1', () => {
    expect(fromPageRefundApplyInput('3001', { refund_type: 1, cart_ids: ['7001'] })).toMatchObject({
      kind: 'refund_only',
      lines: [{ orderItemId: '7001', quantity: 1 }],
    });
  });

  it('matches the shape the contract example posts', () => {
    const body = fromPageRefundApplyInput('3001', { cart_ids: [] });
    expect(Object.keys(body).sort()).toEqual(Object.keys(exampleBody('POST /api/v1/refunds')).sort());
  });

  it('renames the return-shipment fields', () => {
    expect(
      fromPageReturnShipmentInput({ delivery_code: 'SF', delivery_id: 'SF123', delivery_phone: '138' }),
    ).toEqual({ expressCompanyId: 'SF', trackingNo: 'SF123', phone: '138' });
    expect(fromPageReturnShipmentInput(null)).toEqual({
      expressCompanyId: '',
      trackingNo: '',
      phone: '',
    });
  });

  it('maps the 售后 tab index (全部 · 申请中 · 已退款) onto a state', () => {
    expect(fromPageRefundState(0)).toBe('all');
    expect(fromPageRefundState(1)).toBe('open');
    expect(fromPageRefundState(2)).toBe('succeeded');
    expect(fromPageRefundState(undefined)).toBe('all');
  });
});
