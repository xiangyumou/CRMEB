import { example, exampleBody, assertRenderable } from './helpers.mjs';
import {
  legacyDeliveryType,
  toLegacyShipmentLine,
  toLegacyShipment,
  toLegacyShipmentList,
  pickShipment,
  toLegacyTrace,
  toLegacyTracking,
  toLegacyExpressView,
  toLegacyInvoice,
  toLegacyInvoiceList,
  toLegacyInvoicePage,
  fromLegacyInvoiceRequest,
} from '../api/mappers/fulfil.js';
import { toLegacyOrderDetail } from '../api/mappers/order.js';

const SHIPMENTS = example('GET /api/v1/orders/:id/shipments');
const TRACKING = example('GET /api/v1/shipments/:id/tracking');
const INVOICE = example('GET /api/v1/invoices/:id');
const ORDER = example('GET /api/v1/orders/:id');

describe('legacyDeliveryType', () => {
  it('maps the three delivery modes onto the strings the pages compare with', () => {
    expect(legacyDeliveryType('express')).toBe('express');
    expect(legacyDeliveryType('merchant_delivery')).toBe('send');
    expect(legacyDeliveryType('virtual')).toBe('fictitious');
    expect(legacyDeliveryType(undefined)).toBe('');
  });
});

describe('toLegacyShipment', () => {
  const parcel = toLegacyShipment(SHIPMENTS.items[0]);

  it('flattens the parcel onto the old delivery_* trio', () => {
    expect(parcel).toMatchObject({
      id: 4001,
      order_id: '9001',
      delivery_sn: 'SH20260201100000001234',
      delivery_type: 'express',
      delivery_id: 'SF1234567890123',
      delivery_name: '顺丰速运',
      delivery_code: '12',
      status: 'dispatched',
      is_cancel: 0,
    });
    expect(parcel._delivery_time).toBe('2026-02-02 09:00:00');
    assertRenderable(parcel);
  });

  it('renders a 送货 parcel with the courier as the delivery name', () => {
    const send = toLegacyShipment({
      deliveryMode: 'merchant_delivery',
      expressCompanyName: null,
      courierName: '王五',
      courierPhone: '13900139000',
      status: 'dispatched',
    });
    expect(send).toMatchObject({
      delivery_type: 'send',
      delivery_name: '王五',
      sh_delivery_name: '王五',
      sh_delivery_id: '13900139000',
    });
  });

  it('turns every null into something a template can print', () => {
    const empty = toLegacyShipment({ id: '1', orderId: '2', deliveryMode: 'virtual', status: 'delivered' });
    expect(empty).toMatchObject({ delivery_id: '', delivery_name: '', fictitious_content: '', receive_time: 0 });
    assertRenderable(empty);
  });

  it('maps the lines onto cart rows', () => {
    expect(toLegacyShipmentLine(SHIPMENTS.items[0].lines[0])).toMatchObject({
      id: 7001,
      unique: '7001',
      cart_num: 2,
      productInfo: {
        store_name: '有机三只松鼠坚果礼盒',
        image: 'https://cdn.example.com/p/11.jpg',
        attrInfo: { suk: '混合装,1000g' },
      },
    });
    expect(toLegacyShipmentLine(null)).toEqual({});
  });

  it('survives a missing dto', () => {
    expect(toLegacyShipment(null)).toEqual({});
    expect(toLegacyShipmentList(null)).toEqual([]);
    expect(toLegacyShipmentList(SHIPMENTS)).toHaveLength(1);
  });
});

describe('pickShipment', () => {
  it('takes the newest parcel that was not cancelled', () => {
    const dto = {
      items: [
        { id: '1', status: 'dispatched' },
        { id: '2', status: 'delivered' },
        { id: '3', status: 'cancelled' },
      ],
    };
    expect(pickShipment(dto).id).toBe('2');
  });

  it('falls back to the newest of any kind rather than showing nothing', () => {
    expect(pickShipment({ items: [{ id: '9', status: 'cancelled' }] }).id).toBe('9');
  });

  it('answers null for an order with nothing shipped yet', () => {
    expect(pickShipment({ items: [] })).toBe(null);
    expect(pickShipment(null)).toBe(null);
  });
});

describe('toLegacyTracking', () => {
  const express = toLegacyTracking(TRACKING);

  it('rebuilds the `{status, result}` blob the 物流 page destructures', () => {
    expect(express.status).toBe(1);
    expect(express.result).toMatchObject({
      number: 'SF1234567890123',
      expName: '顺丰速运',
      deliverystatus: 1,
      issign: 0,
    });
    assertRenderable(express);
  });

  it('keeps the trace steps in the order the server sent them', () => {
    expect(express.result.list).toEqual([
      { time: '2026-02-02 09:30:00', status: '快件已从杭州转运中心发出' },
      { time: '2026-02-02 09:05:00', status: '顺丰速运 已收取快件' },
    ]);
    expect(toLegacyTrace(null)).toEqual({ time: '', status: '' });
  });

  it('says "no feed" rather than pretending the parcel is missing', () => {
    const none = toLegacyTracking({ ...TRACKING, available: false, state: 'unknown', traces: [] });
    expect(none).toMatchObject({ status: 0, msg: '暂无物流信息' });
    expect(none.result.list).toEqual([]);
  });

  it('marks a delivered parcel as signed for', () => {
    const done = toLegacyTracking({ ...TRACKING, state: 'delivered' });
    expect(done.result).toMatchObject({ deliverystatus: 3, issign: 1 });
  });

  it('survives a missing dto', () => {
    expect(toLegacyTracking(null).result.list).toEqual([]);
  });
});

describe('toLegacyExpressView', () => {
  const order = toLegacyOrderDetail(ORDER);

  it('flattens the parcel onto the order, which is where the page reads it', () => {
    const view = toLegacyExpressView(order, SHIPMENTS.items[0], TRACKING);
    expect(view.order).toMatchObject({
      delivery_id: 'SF1234567890123',
      delivery_name: '顺丰速运',
      delivery_type: 'express',
    });
    expect(view.express.result.list).toHaveLength(2);
    expect(view.order.cartInfo).toHaveLength(1);
    assertRenderable(view);
  });

  it('still answers an order with no parcel, with an empty timeline', () => {
    const view = toLegacyExpressView(order, null, null);
    expect(view.express.result.list).toEqual([]);
    expect(view.shipment).toBe(null);
    // The order's own goods are still there, so the page renders its header.
    expect(view.order.cartInfo).toHaveLength(1);
  });

  it('borrows the parcel lines when the order view carries none', () => {
    const view = toLegacyExpressView({ cartInfo: [] }, SHIPMENTS.items[0], null);
    expect(view.order.cartInfo).toHaveLength(1);
  });
});

describe('toLegacyInvoice', () => {
  const invoice = toLegacyInvoice(INVOICE);

  it('maps the header onto the legacy 1/2 enums the pages branch on', () => {
    expect(invoice).toMatchObject({
      id: 3001,
      order_id: '9001',
      order_no: '202602011000000010123456',
      status: 'requested',
      is_invoice: 0,
      header_type: 2,
      type: 1,
      name: '杭州某某科技有限公司',
      duty_number: '91330100MA2XXXXX0A',
      email: 'finance@example.com',
      pay_price: '118.00',
      add_time: '2026-02-03 10:00:00',
    });
    assertRenderable(invoice);
  });

  it('gives the 发票记录 row an order stub, because the contract carries no line items', () => {
    expect(invoice.order).toEqual({
      order_id: '9001',
      order_no: '202602011000000010123456',
      pay_price: '118.00',
      cartInfo: [],
    });
  });

  it('flags an issued invoice and carries its number', () => {
    const issued = toLegacyInvoice({ ...INVOICE, status: 'issued', invoiceNumber: '04400021130' });
    expect(issued).toMatchObject({ is_invoice: 1, invoice_number: '04400021130', unique_num: '04400021130' });
  });

  it('survives a missing dto', () => {
    expect(toLegacyInvoice(null)).toEqual({});
    expect(toLegacyInvoiceList(null)).toEqual([]);
  });

  it('offers both the array and the counted page', () => {
    const page = example('GET /api/v1/invoices');
    expect(toLegacyInvoiceList(page)).toHaveLength(1);
    expect(toLegacyInvoicePage(page)).toMatchObject({ count: 1, page: 1, limit: 20 });
  });
});

describe('fromLegacyInvoiceRequest', () => {
  it('builds the company body the contract takes', () => {
    const body = fromLegacyInvoiceRequest({
      header_type: 2,
      type: 1,
      name: '杭州某某科技有限公司',
      duty_number: '91330100MA2XXXXX0A',
      drawer_phone: '13800138000',
      email: 'finance@example.com',
    });
    expect(body).toEqual(exampleBody('POST /api/v1/orders/:id/invoice'));
  });

  it('leaves the optional fields out rather than sending empty strings', () => {
    const body = fromLegacyInvoiceRequest({ header_type: 1, name: '张三', duty_number: '' });
    expect(body).toEqual({ headerType: 'personal', invoiceType: 'plain', name: '张三' });
  });

  it('carries the 专用发票 bank block through', () => {
    expect(
      fromLegacyInvoiceRequest({
        header_type: 2,
        type: 2,
        name: '某某公司',
        tell: '0571-000',
        address: '文三路 1 号',
        bank: '某某银行',
        card_number: '6222',
      }),
    ).toMatchObject({
      invoiceType: 'special',
      registeredTel: '0571-000',
      registeredAddress: '文三路 1 号',
      bankName: '某某银行',
      bankAccount: '6222',
    });
  });

  it('survives a missing payload', () => {
    expect(fromLegacyInvoiceRequest(null)).toEqual({
      headerType: 'personal',
      invoiceType: 'plain',
      name: '',
    });
  });
});
