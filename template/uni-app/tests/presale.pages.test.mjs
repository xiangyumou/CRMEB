// 预售 — the list → detail → confirm path a shopper can actually tap (CR-2-i).
//
// `pages/activity/presell_details/index.vue` had the whole presale purchase flow and
// no entry in `pages.json`, and the list sent the shopper to the plain product page,
// which cannot buy a presale. This file pins the three things that make it reachable
// and correct:
//
//   1. the page is registered in the `pages/activity` subpackage, and the list's
//      `goDetails()` goes there with the activity id;
//   2. every `@/api` function the detail page imports is exported by that module;
//   3. every call the page makes, with the arguments the page passes, lands on a real
//      storefront contract route — and 立即购买 reaches checkout as
//      `kind: 'presale'` with the activity id, never as a normal purchase.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXAMPLES, example } from './helpers.mjs';

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

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(APP, rel), 'utf8');

const DETAIL_PAGE = 'pages/activity/presell_details/index.vue';

// ---------------------------------------------------------------------------
// a fake `uni.request` that answers every call with its contract's own example
// ---------------------------------------------------------------------------

/** `GET /api/v1/presale/activities/:id` → a matcher for a concrete method + path. */
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

let store;
let order;
let user;
let api;
let pub;

beforeAll(async () => {
  installUni();
  store = await import('../api/store.js');
  order = await import('../api/order.js');
  user = await import('../api/user.js');
  api = await import('../api/api.js');
  pub = await import('../api/public.js');
});

beforeEach(() => installUni());

// ---------------------------------------------------------------------------
// 1. reachable
// ---------------------------------------------------------------------------

describe('预售详情 is a page a shopper can reach (CR-2-i)', () => {
  it('is registered in the pages/activity subpackage', () => {
    const pages = JSON.parse(read('pages.json'));
    const activity = pages.subPackages.find((p) => p.root === 'pages/activity');
    const entry = activity.pages.find((p) => p.path === 'presell_details/index');
    expect(entry).toBeDefined();
    // The page draws its own header (`navH`), as 拼团详情 does.
    expect(entry.style).toMatchObject({ navigationStyle: 'custom' });
    expect(fs.existsSync(path.join(APP, DETAIL_PAGE))).toBe(true);
  });

  it("is where the 预售列表's goDetails() goes, keyed by the activity id", () => {
    const list = read('pages/activity/presell/index.vue');
    const body = list.slice(list.indexOf('goDetails(item) {'));
    const url = body.slice(0, body.indexOf('}'));
    expect(url).toContain("'/pages/activity/presell_details/index?id=' + item.id");
    expect(url).not.toContain('goods_details');
  });
});

// ---------------------------------------------------------------------------
// 2. every import resolves
// ---------------------------------------------------------------------------

describe('预售详情 imports only functions its api modules export', () => {
  const MODULES = { store: 'store', user: 'user', api: 'api', order: 'order', public: 'pub' };

  it('finds each named import from @/api/* on the module', () => {
    const source = read(DETAIL_PAGE);
    const imports = [...source.matchAll(/import\s*\{([^}]*)\}\s*from\s*'@\/api\/(\w+)(?:\.js)?'/g)];
    expect(imports.length).toBeGreaterThanOrEqual(5);
    const loaded = { store, user, api, order, pub };
    for (const [, names, file] of imports) {
      const mod = loaded[MODULES[file]];
      expect(mod, `@/api/${file}`).toBeDefined();
      for (const name of names.split(',').map((n) => n.trim()).filter(Boolean)) {
        expect(typeof mod[name], `@/api/${file} ${name}`).toBe('function');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 3. every call lands on a contract route, with the arguments the page passes
// ---------------------------------------------------------------------------

describe('预售详情 calls, as the page makes them', () => {
  const PRESALE = example('GET /api/v1/presale/activities/:id');
  const ACTIVITY_ID = String(PRESALE.activityId);

  it('getPresellProductDetail(activity id) reads the presale contract, public', async () => {
    const res = await store.getPresellProductDetail(ACTIVITY_ID);
    expect(calls.map((c) => c.route)).toEqual(['GET /api/v1/presale/activities/:id']);
    expect(calls[0].url).toBe(`https://shop.test/api/v1/presale/activities/${ACTIVITY_ID}`);
    // What getGoodsDetails() reads off it.
    const { storeInfo } = res.data;
    expect(storeInfo.id).toBe(Number(ACTIVITY_ID));
    expect(storeInfo.product_id).toBe(Number(PRESALE.productId));
    expect(storeInfo.title).toBe(PRESALE.title);
    expect(res.data.pay_status).toBe(1);
    expect(Object.keys(res.data.productValue).length).toBeGreaterThan(0);
  });

  it('立即购买 reaches checkout as a presale of this activity, not a normal purchase', async () => {
    const detail = (await store.getPresellProductDetail(ACTIVITY_ID)).data;
    const sku = Object.values(detail.productValue)[0];
    calls = [];

    // goCat(): exactly the object the page builds.
    const res = await store.postCartAdd({
      productId: detail.storeInfo.product_id,
      advanceId: ACTIVITY_ID,
      cartNum: 2,
      uniqueId: sku.unique,
      new: 1,
    });
    // 立即购买 writes nothing to the cart: the confirm page gets a ticket.
    expect(calls).toEqual([]);
    const cartId = res.data.cartId;
    expect(cartId).toBe(`buynow:${sku.unique}:2:presale:${ACTIVITY_ID}`);

    // pages/goods/order_confirm previews and creates with nothing but that cartId.
    await order.orderConfirm({ cartId });
    await order.orderCreate('idem-1', { cartId, addressId: 3 });
    expect(calls.map((c) => c.route)).toEqual([
      'POST /api/v1/checkout/preview',
      'POST /api/v1/orders',
    ]);
    for (const call of calls) {
      expect(call.data).toMatchObject({
        kind: 'presale',
        kindMeta: { activityId: ACTIVITY_ID },
        source: 'buy-now',
        item: { skuId: sku.unique, quantity: 2 },
      });
    }
  });

  it('the rest of the page lands on real routes too', async () => {
    const productId = String(PRESALE.productId);
    await store.collectAdd(productId);
    await store.collectDel([productId]);
    await api.getCoupons({ page: 1, limit: 20, product_id: ACTIVITY_ID });
    await order.getCartCounts();
    await user.getUserInfo();
    await store.getProductCode(productId);
    // getImageBase64(): storeInfo.image, and code_base (empty from this contract).
    await pub.imageBase64(PRESALE.imageUrl, '');

    expect(calls.map((c) => c.route)).toEqual([
      'POST /api/v1/me/favorites',
      'DELETE /api/v1/me/favorites/:productId',
      'GET /api/v1/coupons',
      'GET /api/v1/cart/count',
      'GET /api/v1/profile',
      'GET /api/v1/orders/counts',
      'GET /api/v1/wechat/mini-qrcodes',
      'POST /api/v1/attachments/base64',
    ]);
    // 收藏 is by product, not by activity.
    expect(calls[0].data).toEqual({ productId });
    expect(calls[1].url).toBe(`https://shop.test/api/v1/me/favorites/${productId}`);
    for (const call of calls) expect(call.route, call.url).toBeDefined();
  });
});
