import { describe, expect, it, vi } from 'vitest';

/**
 * A fresh session module per test (its store and single-flight live at module level), with the
 * Taro fake, the fake API and the client of the same module generation.
 */
async function load() {
  vi.resetModules();
  const { taroFake } = await import('@/test/taro-fake/taro');
  const { serveApi } = await import('@/test/fake-api');
  taroFake.loginCode = 'code-1';
  return { ...(await import('./session')), taroFake, serveApi };
}

const user = { id: '7', nickname: '微信用户', avatarUrl: null, phone: '13900000000' };
const signedIn = (token: string) => ({
  status: 'signed-in',
  session: { token, expiresAt: '2026-10-23T00:00:00.000Z', user },
  registered: false,
  bindToken: null,
  bindTokenExpiresInSec: null,
});
const phoneRequired = {
  status: 'phone-required',
  session: null,
  registered: false,
  bindToken: 'bind-1',
  bindTokenExpiresInSec: 600,
};

describe('session', () => {
  it('signs a known shopper in silently with the wx.login code, as wechat-mini', async () => {
    const { serveApi, startSession, taroFake, useSession } = await load();
    const seen = serveApi({
      'POST /api/v1/auth/sessions/wechat-mini': () => ({ body: signedIn('t1') }),
    });

    await Promise.all([startSession(), startSession()]);

    expect(useSession.getState().session).toEqual({ status: 'signed-in', token: 't1' });
    expect(seen).toHaveLength(1); // one run for concurrent callers
    expect(seen[0]?.body).toEqual({ code: 'code-1' });
    expect(seen[0]?.headers['X-Client-Platform'] ?? seen[0]?.headers['x-client-platform']).toBe(
      'wechat-mini',
    );
    expect(taroFake.storage.get('shop.session.token')).toBe('t1');
  });

  it('reuses a stored token without calling wx.login', async () => {
    const { serveApi, startSession, taroFake, useSession } = await load();
    taroFake.storage.set('shop.session.token', 'stored');
    const seen = serveApi({});

    await startSession();

    expect(useSession.getState().session).toEqual({ status: 'signed-in', token: 'stored' });
    expect(seen).toHaveLength(0);
    expect(taroFake.calls.some((call) => call.api === 'login')).toBe(false);
  });

  it('parks a new shopper on phone-required, then binds the phone code', async () => {
    const { bindPhone, serveApi, startSession, useSession } = await load();
    const seen = serveApi({
      'POST /api/v1/auth/sessions/wechat-mini': () => ({ body: phoneRequired }),
      'POST /api/v1/auth/sessions/wechat-mini/phone': () => ({ body: signedIn('t2') }),
    });

    await startSession();
    expect(useSession.getState().session).toEqual({
      status: 'phone-required',
      bindToken: 'bind-1',
    });

    await bindPhone('phone-code');
    expect(useSession.getState().session).toEqual({ status: 'signed-in', token: 't2' });
    expect(seen[1]?.body).toEqual({ bindToken: 'bind-1', phoneCode: 'phone-code' });
  });

  it('keeps the bindToken when WeChat refuses the phone code (AUTH-007)', async () => {
    const { bindPhone, serveApi, startSession, useSession } = await load();
    serveApi({
      'POST /api/v1/auth/sessions/wechat-mini': () => ({ body: phoneRequired }),
      'POST /api/v1/auth/sessions/wechat-mini/phone': () => ({
        status: 400,
        body: { code: 'AUTH_WECHAT_CODE_INVALID', message: '授权已失效，请重试' },
      }),
    });

    await startSession();
    await expect(bindPhone('stale')).rejects.toThrow('授权已失效，请重试');
    expect(useSession.getState().session).toEqual({
      status: 'phone-required',
      bindToken: 'bind-1',
    });
  });

  it('starts over with a new wx.login when the bindToken expired', async () => {
    const { bindPhone, serveApi, startSession, useSession } = await load();
    let logins = 0;
    serveApi({
      'POST /api/v1/auth/sessions/wechat-mini': () => {
        logins += 1;
        return { body: logins === 1 ? phoneRequired : { ...phoneRequired, bindToken: 'bind-2' } };
      },
      'POST /api/v1/auth/sessions/wechat-mini/phone': () => ({
        status: 400,
        body: { code: 'AUTH_WECHAT_BIND_EXPIRED', message: '登录已过期' },
      }),
    });

    await startSession();
    await bindPhone('late');
    expect(useSession.getState().session).toEqual({
      status: 'phone-required',
      bindToken: 'bind-2',
    });
  });

  it('drops a rejected token and signs in again on a 401', async () => {
    const { serveApi, startSession, taroFake, useSession } = await load();
    taroFake.storage.set('shop.session.token', 'revoked');
    serveApi({
      'GET /api/v1/orders/1': () => ({
        status: 401,
        body: { code: 'UNAUTHENTICATED', message: '请先登录' },
      }),
      'POST /api/v1/auth/sessions/wechat-mini': () => ({ body: signedIn('fresh') }),
    });
    const { api } = await import('@/data/api');

    await startSession();
    await expect(api.call('order.detail', { params: { id: '1' } })).rejects.toThrow();
    await vi.waitFor(() =>
      expect(useSession.getState().session).toEqual({ status: 'signed-in', token: 'fresh' }),
    );
    expect(taroFake.storage.get('shop.session.token')).toBe('fresh');
  });

  it('reports a failed wx.login', async () => {
    const { serveApi, startSession, useSession } = await load();
    serveApi({
      'POST /api/v1/auth/sessions/wechat-mini': () => ({
        status: 502,
        body: { code: 'AUTH_WECHAT_UNAVAILABLE', message: '微信服务暂不可用' },
      }),
    });
    await startSession();
    expect(useSession.getState().session).toEqual({
      status: 'failed',
      message: '微信服务暂不可用',
    });
  });
});
