// An end-to-end smoke test of the api layer against a real HTTP server.
//
// The other suites mock `uni.request`, which proves the mappers and the client's
// logic but never that a URL is spelled correctly or that a real response body
// survives the round trip. This one runs the same functions over the wire
// against the contract mock:
//
//   cd next/packages/testing && pnpm mock          # http://127.0.0.1:4010
//   cd template/uni-app && MOCK_URL=http://127.0.0.1:4010 npm test
//
// Without MOCK_URL the whole file is skipped, so `npm test` stays hermetic.

import { EXAMPLES } from './helpers.mjs';

const MOCK_URL = process.env.MOCK_URL || '';

vi.mock('../config/app', () => ({
  HTTP_REQUEST_URL: MOCK_URL,
  API_PREFIX: '/api/v1',
  TOKENNAME: 'Authorization',
  TIMEOUT: 15000,
  EXPIRE: 0,
  LIMIT: 10,
  DEBOUNCETIME: 500,
  clientPlatform: () => 'h5',
}));

vi.mock('../libs/login', () => ({ toLogin: vi.fn(), checkLogin: vi.fn(() => true) }));
vi.mock('../store', () => ({ default: { state: { app: { token: 'mock-token' } }, commit: vi.fn() } }));
vi.mock('../utils/lang.js', () => ({ default: { t: (k) => k } }));

/** `uni.request` on top of `fetch`, which is the only uni API these calls need. */
function installUniRequest() {
  globalThis.uni = {
    request(options) {
      const headers = { ...(options.header || {}) };
      const init = { method: options.method || 'GET', headers };
      let url = options.url;
      if (options.data && init.method === 'GET') {
        const qs = new URLSearchParams(
          Object.entries(options.data).filter(([, v]) => v !== undefined && v !== null && v !== ''),
        ).toString();
        if (qs) url += (url.indexOf('?') === -1 ? '?' : '&') + qs;
      } else if (options.data) {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(options.data);
      }
      fetch(url, init)
        .then(async (res) => {
          const text = await res.text();
          let data = text;
          try { data = text ? JSON.parse(text) : {}; } catch (e) { /* leave as text */ }
          options.success({ statusCode: res.status, data, header: Object.fromEntries(res.headers) });
        })
        .catch((err) => options.fail({ errMsg: String((err && err.message) || err) }));
    },
    getStorageSync: () => '',
    setStorageSync: () => {},
    showToast: () => {},
  };
}

const d = MOCK_URL ? describe : describe.skip;

d('the api layer against the contract mock', () => {
  let order;
  let store;
  let admin;

  beforeAll(async () => {
    installUniRequest();
    order = await import('../api/order.js');
    store = await import('../api/store.js');
    admin = await import('../api/admin.js');
  });

  /** Every id the mock's examples use, so a detail call asks for something that exists. */
  function exampleId(key, field) {
    const ex = EXAMPLES[key];
    const body = ex && ex.response;
    const first = body && (Array.isArray(body.items) ? body.items[0] : body);
    return (first && first[field]) || '1';
  }

  it('GET /api/v1/cart maps to the legacy cart payload', async () => {
    const res = await order.getCartList({ page: 1, limit: 20 });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.valid)).toBe(true);
    const row = res.data.valid[0];
    expect(row).toBeTruthy();
    // snake_case, decimal-string money, and `unique` carrying the sku id
    expect(row).toHaveProperty('cart_num');
    expect(row).toHaveProperty('productInfo');
    expect(String(row.truePrice)).toMatch(/^\d+(\.\d+)?$/);
  });

  it('GET /api/v1/cart/count answers a number', async () => {
    const res = await order.getCartCounts();
    expect(res.status).toBe(200);
    expect(Number.isFinite(Number(res.data.count))).toBe(true);
  });

  it('GET /api/v1/catalog/products maps to the legacy product list', async () => {
    const res = await store.getProductslist({ page: 1, limit: 10 });
    expect(res.status).toBe(200);
    const list = Array.isArray(res.data) ? res.data : res.data.list;
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]).toHaveProperty('store_name');
  });

  it('GET /api/v1/orders maps to the legacy order list', async () => {
    const res = await order.getOrderList({ type: '', page: 1, limit: 10 });
    expect(res.status).toBe(200);
    const list = Array.isArray(res.data) ? res.data : res.data.list;
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]).toHaveProperty('order_id');
    expect(list[0]._status).toBeTruthy();
  });

  it('GET /api/v1/orders/:id maps to the legacy detail, _status included', async () => {
    const id = exampleId('GET /api/v1/orders', 'id');
    const res = await order.getOrderDetail(id);
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty('order_id');
    expect(res.data._status).toHaveProperty('_type');
  });

  it('GET /api/v1/staff/orders maps to the staff list with the integer _status', async () => {
    const res = await admin.getAdminOrderList({ type: 0, page: 1, limit: 10 });
    expect(res.status).toBe(200);
    const list = Array.isArray(res.data) ? res.data : res.data.list;
    expect(list.length).toBeGreaterThan(0);
    expect(Number.isInteger(list[0]._status)).toBe(true);
  });

  it('GET /api/v1/staff/statistics answers the console header', async () => {
    const res = await admin.getStatisticsInfo();
    expect(res.status).toBe(200);
    expect(res.data).toBeTruthy();
  });

  it('rejects a 404 with both message and msg', async () => {
    await expect(order.getOrderDetail('does-not-exist-999999')).rejects.toMatchObject({
      msg: expect.any(String),
      message: expect.any(String),
    });
  });
});
