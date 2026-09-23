// `utils/visitBeacon.js` — the page-view beacon every page carries through `Vue.mixin`.
//
// Driven the way the runtime drives it: the mixin's hooks called with a page instance
// as `this`, and a fake `uni.request` recording what went over the wire.

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
vi.mock('../libs/login', () => ({ toLogin, checkLogin: vi.fn(() => false) }));

const store = { state: { app: { token: '' } }, commit: vi.fn() };
vi.mock('../store', () => ({ default: store }));
vi.mock('../utils/lang.js', () => ({ default: { t: (k) => k } }));

const { default: beacon, pageRoute } = await import('../utils/visitBeacon.js');

let calls;

beforeEach(() => {
  calls = [];
  store.state.app.token = '';
  toLogin.mockClear();
  globalThis.uni = {
    request(options) {
      calls.push(options);
      options.success({ statusCode: 204, data: '' });
    },
    getStorageSync: () => '',
    setStorageSync: () => {},
    showToast: () => {},
  };
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

/** A mini-program page instance: the route lives on the native page object. */
const miniPage = (route) => ({ $mp: { page: { route } } });
/** An H5 page instance: the route lives on `__page__`. */
const h5Page = (route) => ({ $mp: { page: {} }, __page__: { route } });

describe('pageRoute', () => {
  it('reads the route off a page on either platform, with a leading slash', () => {
    expect(pageRoute(miniPage('pages/index/index'))).toBe('/pages/index/index');
    expect(pageRoute(h5Page('pages/goods_details/index'))).toBe('/pages/goods_details/index');
  });

  it('is empty for the app and for components, which the global mixin also reaches', () => {
    expect(pageRoute({ $mp: { app: {} } })).toBe('');
    expect(pageRoute({ $mp: { component: {} } })).toBe('');
    expect(pageRoute({})).toBe('');
  });

  it('never carries a query string', () => {
    expect(pageRoute(miniPage('pages/users/login/index?code=081abc'))).toBe(
      '/pages/users/login/index',
    );
  });
});

describe('the beacon', () => {
  it('reports the view on show and the time on screen on hide', async () => {
    const page = miniPage('pages/goods_details/index');
    beacon.onShow.call(page);
    vi.advanceTimersByTime(42_000);
    beacon.onHide.call(page);

    expect(calls.map((c) => [c.method, c.url, c.data])).toEqual([
      ['POST', 'https://shop.test/api/v1/visits', { path: '/pages/goods_details/index' }],
      [
        'POST',
        'https://shop.test/api/v1/visits',
        { path: '/pages/goods_details/index', stayMs: 42_000 },
      ],
    ]);
  });

  it('reports a page closed with 返回, which is unloaded without being hidden', () => {
    const page = h5Page('pages/order_details/index');
    beacon.onShow.call(page);
    vi.advanceTimersByTime(5_000);
    beacon.onUnload.call(page);

    expect(calls[1].data).toEqual({ path: '/pages/order_details/index', stayMs: 5_000 });
  });

  it('reports the stay once, however many of hide and unload follow', () => {
    const page = miniPage('pages/index/index');
    beacon.onShow.call(page);
    beacon.onHide.call(page);
    beacon.onUnload.call(page);

    expect(calls).toHaveLength(2);
  });

  it('starts a new stay when the page is shown again', () => {
    const page = miniPage('pages/index/index');
    beacon.onShow.call(page);
    vi.advanceTimersByTime(3_000);
    beacon.onHide.call(page);
    beacon.onShow.call(page);
    vi.advanceTimersByTime(7_000);
    beacon.onHide.call(page);

    expect(calls.map((c) => c.data.stayMs)).toEqual([undefined, 3_000, undefined, 7_000]);
  });

  it('sends nothing for the app or a component', () => {
    const app = { $mp: { app: {} } };
    beacon.onShow.call(app);
    beacon.onHide.call(app);
    expect(calls).toEqual([]);
  });

  it('sends the session when there is one, and never asks a visitor to sign in', async () => {
    const page = miniPage('pages/index/index');

    beacon.onShow.call(page);
    expect(calls[0].header.Authorization).toBeUndefined();
    expect(toLogin).not.toHaveBeenCalled();

    store.state.app.token = 'tok';
    beacon.onHide.call(page);
    expect(calls[1].header.Authorization).toBe('Bearer tok');
  });

  it('swallows a failed request', async () => {
    globalThis.uni.request = (options) => options.fail({ errMsg: 'request:fail' });
    const page = miniPage('pages/index/index');
    expect(() => beacon.onShow.call(page)).not.toThrow();
    // Let the rejected promise settle; an unhandled rejection would fail the run.
    await vi.runAllTimersAsync();
  });
});
