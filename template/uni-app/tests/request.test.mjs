// `utils/request.js` — the storefront HTTP client.
//
// Everything it touches (`config/app`, `libs/login`, `store`, `utils/lang`) is mocked,
// so the client runs under plain Node with no uni-app runtime. `config/app.js` in
// particular *must* be mocked: it uses conditional compilation, so it declares `ORIGIN`
// several times and is not valid standalone JavaScript.

vi.mock('../config/app', () => ({
  HTTP_REQUEST_URL: 'https://shop.test',
  API_PREFIX: '/api/v1',
  TOKENNAME: 'Authorization',
  TIMEOUT: 15000,
  EXPIRE: 0,
  LIMIT: 10,
  DEBOUNCETIME: 500,
  clientPlatform: () => 'wechat-mini',
}));

const toLogin = vi.fn();
const checkLogin = vi.fn(() => false);
vi.mock('../libs/login', () => ({ toLogin, checkLogin }));

const commit = vi.fn();
const store = { state: { app: { token: '' } }, commit };
vi.mock('../store', () => ({ default: store }));

vi.mock('../utils/lang.js', () => ({ default: { t: (k) => k } }));

const { default: request, baseRequest, resetLoginPrompt, NETWORK_ERROR, UNAUTHENTICATED } =
  await import('../utils/request.js');

/** Queue one `uni.request` outcome; returns the options the client passed. */
function respond(outcome) {
  const seen = [];
  globalThis.uni = {
    request(options) {
      seen.push(options);
      const r = typeof outcome === 'function' ? outcome(options, seen.length - 1) : outcome;
      if (r.errMsg !== undefined) options.fail(r);
      else options.success(r);
    },
  };
  return seen;
}

beforeEach(() => {
  store.state.app.token = 'tok-123';
  toLogin.mockClear();
  checkLogin.mockClear();
  commit.mockClear();
  resetLoginPrompt();
});

describe('the resolved envelope', () => {
  it('resolves {data, msg, status: 200} and applies the map', async () => {
    respond({ statusCode: 200, data: { id: '9001' } });
    const res = await request.get('/api/v1/orders/9001', {}, { map: (d) => ({ order_id: d.id }) });
    expect(res).toEqual({ data: { order_id: '9001' }, msg: '', status: 200 });
  });

  it('takes msg from a string or from a function of the raw payload', async () => {
    respond({ statusCode: 201, data: { alreadyPaid: true } });
    expect((await request.post('/api/v1/x', {}, { msg: '成功' })).msg).toBe('成功');
    expect((await request.post('/api/v1/x', {}, { msg: (p) => (p.alreadyPaid ? '已支付' : '待支付') })).msg)
      .toBe('已支付');
  });

  it('rejects with MAP_ERROR rather than throwing out of the promise', async () => {
    respond({ statusCode: 200, data: {} });
    await expect(
      request.get('/api/v1/x', {}, {
        map: () => {
          throw new Error('bad shape');
        },
      }),
    ).rejects.toMatchObject({ status: 200, code: 'MAP_ERROR', message: 'bad shape', msg: 'bad shape' });
  });
});

describe('status handling', () => {
  it('treats every 2xx as success', async () => {
    for (const statusCode of [200, 201, 202, 204]) {
      respond({ statusCode, data: {} });
      await expect(request.post('/api/v1/x', {})).resolves.toMatchObject({ status: 200 });
    }
  });

  it('rejects with the contract error body', async () => {
    respond({ statusCode: 422, data: { code: 'CART_SKU_UNAVAILABLE', message: '库存不足', details: { skuId: '21' } } });
    await expect(request.post('/api/v1/cart/items', {})).rejects.toEqual({
      status: 422,
      code: 'CART_SKU_UNAVAILABLE',
      message: '库存不足',
      msg: '库存不足',
      details: { skuId: '21' },
    });
  });

  it('does not hang on 402 — the old client never settled that promise', async () => {
    respond({ statusCode: 402, data: { code: 'PAYMENT_REQUIRED', message: '需要支付' } });
    await expect(request.post('/api/v1/x', {})).rejects.toMatchObject({ status: 402 });
  });

  it('falls back to a message when the body is not an error object', async () => {
    respond({ statusCode: 500, data: '<html>502</html>' });
    await expect(request.get('/api/v1/x', {})).rejects.toMatchObject({
      status: 500,
      code: 'HTTP_ERROR',
      message: '系统错误',
    });
  });

  it('rejects a transport failure as an object, not a string', async () => {
    respond({ errMsg: 'request:fail timeout' });
    const err = await request.get('/api/v1/x', {}).catch((e) => e);
    expect(err).toEqual({
      status: 0,
      code: NETWORK_ERROR,
      message: 'request:fail timeout',
      msg: 'request:fail timeout',
    });
    expect(typeof err).toBe('object');
  });
});

describe('the 401 single flight', () => {
  it('pushes the login page once for a burst of 401s', async () => {
    respond({ statusCode: 401, data: { code: 'UNAUTHORIZED', message: '登录已过期' } });
    await Promise.all([
      request.get('/api/v1/me').catch(() => {}),
      request.get('/api/v1/cart').catch(() => {}),
      request.get('/api/v1/orders').catch(() => {}),
    ]);
    expect(toLogin).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith('LOGOUT');
  });

  it('arms again after a successful response', async () => {
    respond({ statusCode: 401, data: {} });
    await request.get('/api/v1/me').catch(() => {});
    respond({ statusCode: 200, data: {} });
    await request.get('/api/v1/me');
    respond({ statusCode: 401, data: {} });
    await request.get('/api/v1/me').catch(() => {});
    expect(toLogin).toHaveBeenCalledTimes(2);
  });

  it('never redirects a noAuth call', async () => {
    respond({ statusCode: 401, data: {} });
    await request.get('/api/v1/catalog/products', {}, { noAuth: true }).catch(() => {});
    expect(toLogin).not.toHaveBeenCalled();
  });

  it('rejects before the wire when there is no session at all', async () => {
    store.state.app.token = '';
    checkLogin.mockReturnValue(false);
    const seen = respond({ statusCode: 200, data: {} });
    await expect(request.get('/api/v1/me')).rejects.toMatchObject({
      status: 401,
      code: UNAUTHENTICATED,
    });
    expect(seen).toHaveLength(0);
    expect(toLogin).toHaveBeenCalledTimes(1);
  });
});

describe('headers', () => {
  it('sends Bearer, the platform and JSON on every request', async () => {
    const seen = respond({ statusCode: 200, data: {} });
    await request.get('/api/v1/me');
    expect(seen[0].header).toEqual({
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Client-Platform': 'wechat-mini',
      Authorization: 'Bearer tok-123',
    });
  });

  it('omits the token on a noAuth call, even when one is in the store', async () => {
    const seen = respond({ statusCode: 200, data: {} });
    await request.get('/api/v1/catalog/products', {}, { noAuth: true });
    expect(seen[0].header.Authorization).toBeUndefined();
  });

  it('builds a fresh header object each time, so a logout cannot leak', async () => {
    const seen = respond({ statusCode: 200, data: {} });
    await request.get('/api/v1/me');
    store.state.app.token = '';
    checkLogin.mockReturnValue(true);
    await request.get('/api/v1/me');
    expect(seen[0].header.Authorization).toBe('Bearer tok-123');
    expect(seen[1].header.Authorization).toBeUndefined();
    expect(seen[0].header).not.toBe(seen[1].header);
  });

  it('drops the legacy Cb-lang and Form-type headers', async () => {
    const seen = respond({ statusCode: 200, data: {} });
    await request.get('/api/v1/me');
    expect(Object.keys(seen[0].header)).not.toContain('Cb-lang');
    expect(Object.keys(seen[0].header)).not.toContain('Form-type');
  });

  it('merges extra headers without losing the defaults', async () => {
    const seen = respond({ statusCode: 200, data: {} });
    await request.get('/api/v1/me', {}, { headers: { 'X-Trace': 'abc' } });
    expect(seen[0].header['X-Trace']).toBe('abc');
    expect(seen[0].header['X-Client-Platform']).toBe('wechat-mini');
  });
});

describe('url and body', () => {
  it('turns data into a query string for GET and DELETE and sends no body', async () => {
    const seen = respond({ statusCode: 200, data: {} });
    await request.get('/api/v1/orders', { page: 1, pageSize: 20, tab: 'unpaid' });
    expect(seen[0].url).toBe('https://shop.test/api/v1/orders?page=1&pageSize=20&tab=unpaid');
    expect(seen[0].data).toBeUndefined();
    await request.delete('/api/v1/cart/items/5001', { force: 1 });
    expect(seen[1].url).toBe('https://shop.test/api/v1/cart/items/5001?force=1');
  });

  it('keeps the body for POST/PUT/PATCH and puts opt.query in the url', async () => {
    const seen = respond({ statusCode: 200, data: {} });
    await request.post('/api/v1/uploads', { a: 1 }, { query: { purpose: 'review' } });
    expect(seen[0].url).toBe('https://shop.test/api/v1/uploads?purpose=review');
    expect(seen[0].data).toEqual({ a: 1 });
  });

  it('skips empty query values and expands arrays', async () => {
    const seen = respond({ statusCode: 200, data: {} });
    await request.get('/api/v1/x', { a: '', b: null, c: undefined, d: 0, ids: ['1', '2'] });
    expect(seen[0].url).toBe('https://shop.test/api/v1/x?d=0&ids=1&ids=2');
  });

  it('encodes values', async () => {
    const seen = respond({ statusCode: 200, data: {} });
    await request.get('/api/v1/catalog/products', { keyword: '白 T恤&' });
    expect(seen[0].url).toBe(
      `https://shop.test/api/v1/catalog/products?keyword=${encodeURIComponent('白 T恤&')}`,
    );
  });

  it('applies the 15 s default timeout and lets a call override it', async () => {
    const seen = respond({ statusCode: 200, data: {} });
    await request.get('/api/v1/x');
    await request.get('/api/v1/x', {}, { timeout: 3000 });
    expect(seen[0].timeout).toBe(15000);
    expect(seen[1].timeout).toBe(3000);
  });

  it('exposes exactly the five verbs the API uses', () => {
    expect(Object.keys(request).sort()).toEqual(['delete', 'get', 'patch', 'post', 'put']);
    expect(typeof baseRequest).toBe('function');
  });
});
