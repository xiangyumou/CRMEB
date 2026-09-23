// Call-level checks: an `api/*.js` function, called with
// exactly what the page passes, lands on the right contract route with the
// right query or body. A fake `uni.request` answers every call from the
// contracts' own examples and 404s anything no contract declares.

import { EXAMPLES } from './helpers.mjs';

vi.mock('../config/app', () => ({
  HTTP_REQUEST_URL: 'https://shop.test',
  API_PREFIX: '/api/v1',
  TOKENNAME: 'Authorization',
  TIMEOUT: 15000,
  EXPIRE: 0,
  LIMIT: 10,
  DEBOUNCETIME: 500,
  clientPlatform: () => 'h5',
}));
vi.mock('../libs/login', () => ({ toLogin: vi.fn(), checkLogin: vi.fn(() => true) }));
vi.mock('../store', () => ({
  default: { state: { app: { token: 'tok', uid: 7 } }, commit: vi.fn() },
}));
vi.mock('../utils/lang.js', () => ({ default: { t: (k) => k } }));
vi.mock('../libs/wechat.js', () => ({ default: {} }));

const ROUTES = Object.keys(EXAMPLES).map((key) => {
  const [method, template] = key.split(' ');
  const pattern = template.replace(/:[A-Za-z]+/g, '[^/]+');
  return { key, method, re: new RegExp(`^${pattern}$`) };
});

function routeFor(method, url) {
  const pathname = new URL(url).pathname;
  // A literal segment beats a `:param` one (`/diy/pages/home` vs `/diy/pages/:id`).
  const hits = ROUTES.filter((r) => r.method === method && r.re.test(pathname));
  hits.sort((a, b) => (a.key.match(/:/g) || []).length - (b.key.match(/:/g) || []).length);
  return hits[0];
}

let calls;

function installUni() {
  calls = [];
  globalThis.uni = {
    request(options) {
      const method = options.method || 'GET';
      const route = routeFor(method, options.url);
      calls.push({ method, url: options.url, data: options.data, route: route && route.key });
      if (!route) {
        options.success({ statusCode: 404, data: { code: 'NOT_FOUND', message: options.url } });
        return;
      }
      options.success({ statusCode: method === 'GET' ? 200 : 201, data: EXAMPLES[route.key].response });
    },
    getStorageSync: () => '',
    setStorageSync: () => {},
    showToast: () => {},
  };
}

let api;
let order;

beforeAll(async () => {
  installUni();
  api = await import('../api/api.js');
  order = await import('../api/order.js');
});

beforeEach(() => installUni());

describe('a micro page reads its own page, not the home page', () => {
  it("getThemeInfo('home', {theme_id}) — what pages/annex/special calls — reads /diy/pages/:id", async () => {
    await api.getThemeInfo('home', { theme_id: 42 });
    expect(calls.map((c) => c.url)).toEqual(['https://shop.test/api/v1/diy/pages/42']);
  });

  it("getThemeInfo('home') without a theme_id is still the home page", async () => {
    await api.getThemeInfo('home', {});
    await api.getThemeInfo('home');
    expect(calls.map((c) => c.url)).toEqual([
      'https://shop.test/api/v1/diy/pages/home',
      'https://shop.test/api/v1/diy/pages/home',
    ]);
  });
});

describe('确认订单 → 提交订单 carries the cart and a real idempotency key', () => {
  const KEY = /^[A-Za-z0-9_-]{8,64}$/;

  it('orderConfirm hands the page an orderKey the orders contract accepts', async () => {
    const first = await order.orderConfirm({ cartId: '5001', new: 0 });
    const second = await order.orderConfirm({ cartId: '5001', new: 0 });
    expect(first.data.orderKey).toMatch(KEY);
    expect(second.data.orderKey).toMatch(KEY);
    // One key per confirm-page load: a double tap reuses it, a new visit does not.
    expect(second.data.orderKey).not.toBe(first.data.orderKey);
  });

  it('computedPrice (what the page now sends) previews the same cart, not an empty one', async () => {
    await order.postOrderComputed('', { cartId: '5001,5002', addressId: 301, useIntegral: 0, couponId: 0, shipping_type: 1, payType: '' });
    expect(calls[0].route).toBe('POST /api/v1/checkout/preview');
    expect(calls[0].data).toMatchObject({ source: 'cart', cartItemIds: ['5001', '5002'], addressId: '301' });
  });

  it('SubOrder (what the page now sends) creates the order for that cart with the minted key', async () => {
    const confirm = await order.orderConfirm({ cartId: '5001' });
    calls = [];
    await order.orderCreate(confirm.data.orderKey, {
      cartId: '5001',
      custom_form: [],
      addressId: 301,
      couponId: 0,
      mark: '',
      pinkId: 0,
      shipping_type: 1,
    });
    expect(calls[0].route).toBe('POST /api/v1/orders');
    expect(calls[0].data).toMatchObject({ source: 'cart', cartItemIds: ['5001'], idempotencyKey: confirm.data.orderKey });
    expect(calls[0].data).not.toHaveProperty('customForm');
  });
});

describe('the poster — an image that already is a data: URL is not sent to be converted', () => {
  const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

  it('resolves a data: image locally and still converts a URL', async () => {
    const out = await api.toDataUrls(PIXEL, 'https://shop.test/uploads/qr.png');
    expect(out.data.image).toBe(PIXEL);
    expect(calls.map((c) => c.route)).toEqual(['POST /api/v1/attachments/base64']);
  });

  it('sends nothing for a missing image (an activity with no cover of its own)', async () => {
    const out = await api.toDataUrls('', '');
    expect(out.data).toEqual({ image: '', code: '' });
    expect(calls).toEqual([]);
  });

  it('makes no request at all when both are data: URLs', async () => {
    const out = await api.toDataUrls(PIXEL, PIXEL);
    expect(out.data).toEqual({ image: PIXEL, code: PIXEL });
    expect(calls).toEqual([]);
  });
});

describe('一键换色 — the presell list never fails on a shop with no theme', () => {
  it('a 404 from /diy/theme resolves the default palette', async () => {
    const saved = globalThis.uni.request;
    globalThis.uni.request = (options) =>
      options.success({ statusCode: 404, data: { code: 'DIY_THEME_NOT_FOUND', message: '主题不存在' } });
    try {
      const res = await api.colorChange('color_change');
      expect(res.data.status).toBe(3);
    } finally {
      globalThis.uni.request = saved;
    }
  });

  it('a published theme answers its palette number', async () => {
    const res = await api.colorChange('color_change');
    expect(res.data.status).toBe(3);
    expect(calls.map((c) => c.route)).toEqual(['GET /api/v1/diy/theme']);
  });
});
