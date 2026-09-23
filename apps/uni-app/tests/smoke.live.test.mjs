// An end-to-end smoke test of the api layer against a real HTTP server.
//
// The other suites mock `uni.request`, which proves the mappers and the client's
// logic but never that a URL is spelled correctly or that a real response body
// survives the round trip. This one runs the same functions over the wire
// against the contract mock:
//
//   cd packages/testing && pnpm mock          # http://127.0.0.1:4010
//   cd apps/uni-app && MOCK_URL=http://127.0.0.1:4010 npm test
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
// api/public.js pulls in the JS-SDK wrapper, which needs the `@/` alias and a browser.
vi.mock('../libs/wechat.js', () => ({ default: {} }));

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
  let activity;
  let user;
  let api;
  let pub;

  beforeAll(async () => {
    installUniRequest();
    order = await import('../api/order.js');
    store = await import('../api/store.js');
    admin = await import('../api/admin.js');
    activity = await import('../api/activity.js');
    user = await import('../api/user.js');
    api = await import('../api/api.js');
    pub = await import('../api/public.js');
  });

  /** Every id the mock's examples use, so a detail call asks for something that exists. */
  function exampleId(key, field) {
    const ex = EXAMPLES[key];
    const body = ex && ex.response;
    const first = body && (Array.isArray(body.items) ? body.items[0] : body);
    return (first && first[field]) || '1';
  }

  it('GET /api/v1/cart maps to the page cart payload', async () => {
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

  it('GET /api/v1/catalog/products maps to the page product list', async () => {
    const res = await store.getProductslist({ page: 1, limit: 10 });
    expect(res.status).toBe(200);
    const list = Array.isArray(res.data) ? res.data : res.data.list;
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]).toHaveProperty('store_name');
  });

  it('GET /api/v1/orders maps to the page order list', async () => {
    const res = await order.getOrderList({ type: '', page: 1, limit: 10 });
    expect(res.status).toBe(200);
    const list = Array.isArray(res.data) ? res.data : res.data.list;
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]).toHaveProperty('order_id');
    expect(list[0]._status).toBeTruthy();
  });

  it('GET /api/v1/orders/:id maps to the page detail, _status included', async () => {
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

  // The five compositions. Each one fans a page call out across two or
  // more routes, and a fan-out is exactly what the mocked-`uni.request` suites cannot
  // prove: the URLs have to be right and the pieces have to come back in the shape
  // the page destructures.

  it('拼团详情 composes the activity with its open teams', async () => {
    const id = exampleId('GET /api/v1/groupbuy/activities', 'id');
    const res = await activity.getCombinationDetail(id);
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty('storeInfo');
    expect(Array.isArray(res.data.pink)).toBe(true);
  });

  it('预售列表 maps to the page activity card', async () => {
    const res = await activity.getPresellList({ page: 1, limit: 10 });
    expect(res.status).toBe(200);
    const list = Array.isArray(res.data) ? res.data : res.data.list;
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]).toHaveProperty('store_name');
  });

  it('个人中心 composes the profile with the order badges', async () => {
    const res = await user.getUserInfo();
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty('nickname');
    // nine keys, always present, so the badge row never renders `undefined`
    expect(res.data.orderStatusNum).toHaveProperty('unpaid_count');
    expect(res.data.orderStatusNum).toHaveProperty('refund_count');
  });

  it('站内信 maps to the {list, count} the 消息中心 concats onto', async () => {
    const res = await user.messageSystem({ page: 1, limit: 10 });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.list)).toBe(true);
    expect(res.data.list[0]).toHaveProperty('look');
  });

  it('订阅消息模板 fans out to the four scenes and keys them back', async () => {
    const res = await api.getTempIds();
    expect(res.status).toBe(200);
    expect(Object.keys(res.data).sort()).toEqual(
      ['order-create', 'order-pay', 'order-ship', 'refund'],
    );
    for (const ids of Object.values(res.data)) expect(Array.isArray(ids)).toBe(true);
  });

  // 商品管理 — ten routes. Two of them are fan-outs
  // (批量下架 and the single-spec 保存) and the rest are a URL plus a mapper, which
  // is exactly what a mocked `uni.request` cannot prove.

  it('商品列表 maps to the {list, count} the 商品管理 pages through', async () => {
    const res = await admin.adminProductList({ page: 1, limit: 20, type: 1, store_name: '' });
    expect(res.status).toBe(200);
    expect(res.data.list.length).toBeGreaterThan(0);
    expect(res.data.list[0]).toHaveProperty('store_name');
    // every row can mount the 修改价格/库存 drawer
    expect(res.data.list[0].attr_value).toHaveProperty('price');
  });

  it('批量下架 fans one call out over the selected products', async () => {
    const id = exampleId('GET /api/v1/staff/products', 'id');
    const res = await admin.productSetShow({ id: [id, id], is_show: 0 });
    expect(res.status).toBe(200);
    expect(res.data).toHaveLength(2);
    expect(res.data[0]).toHaveProperty('store_name');
  });

  it('商品标签 comes back grouped, 商品分类 as a `title` tree', async () => {
    const labels = await admin.getProductLabel();
    expect(labels.data[0]).toHaveProperty('cate_name');
    expect(Array.isArray(labels.data[0].list)).toBe(true);
    const cates = await admin.getProductCate();
    expect(cates.data[0]).toHaveProperty('title');
    expect(Array.isArray(cates.data[0].children)).toBe(true);
  });

  it('两个批量抽屉 post the plural bodies', async () => {
    const id = exampleId('GET /api/v1/staff/products', 'id');
    const labels = await admin.postBatchProcess({ ids: [id], label_list: ['3'] });
    expect(labels.status).toBe(200);
    const cates = await admin.postManageSaveCate({ ids: [id], cate_id: ['17'] });
    expect(cates.status).toBe(200);
  });

  it('商品规格 carries both `id` and `unique`, and the patch round-trips', async () => {
    const id = exampleId('GET /api/v1/staff/products', 'id');
    const attrs = await admin.getManageProductAttr(id);
    expect(attrs.data[0]).toHaveProperty('unique');
    const saved = await admin.postUpdateAttrs(id, {
      attr_value: [{ unique: attrs.data[0].unique, price: '55.00', cost: '', ot_price: '', stock: '' }],
    });
    expect(saved.status).toBe(200);
    expect(saved.data[0]).toHaveProperty('suk');
  });

  it('单规格保存 reads the SKU id first, then patches', async () => {
    const id = exampleId('GET /api/v1/staff/products', 'id');
    // the list row has no `unique`, which is the whole point of the extra read
    const saved = await admin.postUpdateAttrs(id, {
      attr_value: [{ price: '55.00', cost: '', ot_price: '', stock: 80 }],
    });
    expect(saved.status).toBe(200);
  });

  it('运费模板 and 添加商品 speak the contract’s own shapes', async () => {
    const templates = await admin.getTemplateOption();
    expect(templates.data[0]).toHaveProperty('name');
    const created = await admin.productCreate({
      store_name: '手冲挂耳咖啡',
      image: 'https://cdn.example.com/p/44.png',
      slider_image: ['https://cdn.example.com/p/44.png'],
      cate_id: ['17'],
      unit_name: '盒',
      content: '<p></p>',
      is_show: 1,
      freight: 2,
      postage: 0,
      attr: { price: '49.00', cost: '18.00', ot_price: '69.00', stock: 200 },
    });
    expect(created.status).toBe(200);
    expect(created.data).toHaveProperty('store_name');
  });

  // 用户管理 — six routes. `getUserLabel()` with no uid borrows a customer to
  // read the catalogue, and the two writes fan out over a batch selection.

  it('用户列表 and 用户详情 map to the rows the 用户管理 pages render', async () => {
    const list = await admin.getUserList({ page: 1, limit: 20, nickname: '', group_id: 0, label_id: '' });
    expect(list.status).toBe(200);
    expect(list.data.list[0]).toHaveProperty('nickname');
    expect(list.data.list[0].phone).toMatch(/\*/);
    const uid = exampleId('GET /api/v1/staff/users', 'id');
    const detail = await admin.getUserInfo(uid);
    expect(detail.data).toHaveProperty('label_id');
    expect(detail.data).toHaveProperty('group_id');
  });

  it('用户分组 comes back with `group_name`, and 设置分组 fans out', async () => {
    const groups = await admin.getGroupList();
    expect(groups.data[0]).toHaveProperty('group_name');
    const uid = exampleId('GET /api/v1/staff/users', 'id');
    const res = await admin.postUserSetGroup([uid, uid], groups.data[0].id);
    expect(res.status).toBe(200);
    expect(res.msg).toBe('设置成功');
    expect(res.data).toHaveLength(2);
  });

  it('用户标签 reads per customer, or as a catalogue with nothing assigned', async () => {
    const uid = exampleId('GET /api/v1/staff/users', 'id');
    const own = await admin.getUserLabel(uid);
    expect(own.data[0].label[0]).toHaveProperty('label_name');
    const catalogue = await admin.getUserLabel();
    expect(catalogue.data.length).toBeGreaterThan(0);
    for (const group of catalogue.data) for (const label of group.label) expect(label.assigned).toBe(false);
    const saved = await admin.postUserSetLabel(uid, [own.data[0].label[0].id]);
    expect(saved.status).toBe(200);
    expect(saved.data[0]).toHaveProperty('label_id');
  });

  // 赠送优惠券 and 订单赠券 — three routes.

  it('赠券抽屉 lists grantable coupons and grants through coupon-grants', async () => {
    const coupons = await admin.getUserCoupon({ coupon_title: '', uid: 0 });
    expect(coupons.data[0]).toHaveProperty('coupon_title');
    const uid = exampleId('GET /api/v1/staff/users', 'id');
    const res = await admin.postUserSetCoupon([uid, uid], coupons.data[0].id);
    expect(res.status).toBe(200);
    expect(res.data).toHaveLength(2);
    expect(res.msg).toBe('赠送成功');
  });

  it('查看优惠券 reads the customer’s own coupons, spendable first', async () => {
    const seen = [];
    const original = globalThis.uni.request;
    globalThis.uni.request = (options) => {
      seen.push(options.url);
      return original(options);
    };
    let res;
    try {
      res = await admin.getUserCoupon({ coupon_title: '', uid: 1001 });
    } finally {
      globalThis.uni.request = original;
    }
    expect(seen.some((url) => url.includes('/api/v1/staff/users/1001/coupons'))).toBe(true);
    expect(res.data[0]).toMatchObject({ coupon_title: '满 100 减 10', is_use: 0 });
    expect(res.data[0].end_use_time).toBeGreaterThan(res.data[0].start_use_time);
  });

  it('订单赠券 maps to the 支付成功 sheet', async () => {
    const res = await order.orderCoupon('5001');
    expect(res.status).toBe(200);
    expect(res.data[0]).toHaveProperty('coupon_title');
  });

  // 人气条, the three 小程序码 callers and 一键绑定手机号.

  it('拼团人气条 maps to {avatars, pink_count}', async () => {
    const res = await activity.getPink();
    expect(Array.isArray(res.data.avatars)).toBe(true);
    expect(Number.isInteger(res.data.pink_count)).toBe(true);
  });

  it('the three 小程序码 calls answer `code` and `url`', async () => {
    for (const res of [
      await store.getProductCode(1024),
      await activity.scombinationCode(12),
      await user.routineCode(),
    ]) {
      expect(res.status).toBe(200);
      expect(res.data.code).toBeTruthy();
      expect(res.data.url).toBe(res.data.code);
    }
  });

  it('一键绑定手机号 posts the phone code', async () => {
    const res = await user.mpBindingPhone({ phoneCode: 'mp-phone-code-abc' });
    expect(res.status).toBe(200);
    expect(res.msg).toBe('绑定成功');
  });

  // 站点公开配置 — six readers over one GET /api/v1/site/config, the DIY reads, and
  // the poster base64.

  it('reads the site config once for all six readers', async () => {
    api.resetSiteConfig();
    const seen = [];
    const original = globalThis.uni.request;
    globalThis.uni.request = (options) => {
      seen.push(options.url);
      return original(options);
    };
    try {
      const [basic, logo, share, copyright, service, splash] = await Promise.all([
        pub.basicConfig(),
        pub.getLogo(2),
        pub.getShare(),
        api.getCrmebCopyRight(),
        api.getCustomerType(),
        api.getOpenAdv(),
      ]);
      expect(basic.data.site_name).toBeTruthy();
      expect(logo.data).toHaveProperty('logo_url');
      expect(share.data).toHaveProperty('synopsis');
      expect(copyright.data).toHaveProperty('copyrightContext');
      expect(service.data).toHaveProperty('customer_qrcode');
      expect(splash.data).toHaveProperty('status');
    } finally {
      globalThis.uni.request = original;
    }
    expect(seen.filter((url) => url.includes('/api/v1/site/config'))).toHaveLength(1);
  });

  it('底部导航 answers the pageFoot component, 版式 a number, 个人中心 and 商品详情 DIY pages', async () => {
    const nav = await pub.getNavigation();
    expect(nav.data).toHaveProperty('effectConfig');
    const category = await api.getThemeInfo('category');
    expect([1, 2, 3]).toContain(category.data.status);
    const menus = await user.getMenuList();
    expect(menus.data.diy_data).toHaveProperty('value');
    expect(menus.data.routine_my_menus).toEqual([]);
    const center = await api.getThemeInfo('user');
    expect(center.data).toHaveProperty('value');
    // 商品详情: the mock answers the built-in default page
    const detail = await api.getThemeInfo('detail');
    expect(detail.data.type).toBe('product_detail');
    const names = Object.values(detail.data.value).map((node) => node.name);
    expect(names).toContain('productInfo');
    expect(names).toContain('bottomMenu');
  });

  it('海报 base64 posts one url per image and composes {image, code}', async () => {
    const own = '/uploads/attachment/2026/09/2f7c1a9b.png';
    const both = await pub.imageBase64(own, own);
    expect(both.data.image).toMatch(/^data:image\//);
    expect(both.data.code).toMatch(/^data:image\//);
    const imageOnly = await user.imgToBase({ image: own, code: '' });
    expect(imageOnly.data.image).toMatch(/^data:image\//);
    expect(imageOnly.data.code).toBe('');
  });

  it('rejects a 404 with both message and msg', async () => {
    await expect(order.getOrderDetail('does-not-exist-999999')).rejects.toMatchObject({
      msg: expect.any(String),
      message: expect.any(String),
    });
  });
});
