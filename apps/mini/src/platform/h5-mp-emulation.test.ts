import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMULATION_STORAGE_KEY, emulatedUser, emulationPlatform } from './h5-mp-emulation';

const jsapi = {
  appId: 'wxmini',
  timeStamp: '1',
  nonceStr: 'n',
  package: 'prepay_id=wx1',
  signType: 'RSA' as const,
  paySign: 's',
};

function stubControl(answer: unknown) {
  const fetchMock = vi.fn((_url: string, _init: RequestInit) =>
    Promise.resolve(new Response(JSON.stringify(answer), { status: 200 })),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function bodyOf(mock: ReturnType<typeof stubControl>, call = 0): unknown {
  return JSON.parse(String(mock.mock.calls[call]?.[1].body));
}

describe('h5-mp-emulation platform', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('talks to the server as wechat-mini, same origin', () => {
    expect(emulationPlatform.api).toMatchObject({ baseUrl: '', clientPlatform: 'wechat-mini' });
  });

  it('asks the harness for a login code for the emulated WeChat user', async () => {
    window.localStorage.setItem(
      EMULATION_STORAGE_KEY,
      JSON.stringify({ openid: 'o_test', unionid: 'u_test', phone: '13900000001' }),
    );
    const fetchMock = stubControl({ code: 'minted' });

    await expect(emulationPlatform.login()).resolves.toBe('minted');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/__e2e/mini/login-code');
    expect(bodyOf(fetchMock)).toEqual({ openid: 'o_test', unionid: 'u_test' });
  });

  it('makes up a user and keeps it when the harness set none', () => {
    const first = emulatedUser();
    expect(first.openid).toMatch(/^o_emu_\d{16}$/);
    expect(first.phone).toMatch(/^139\d{8}$/);
    expect(emulatedUser()).toEqual(first);
  });

  it('settles the payment through the harness, or plays the shopper cancelling', async () => {
    window.localStorage.setItem(
      EMULATION_STORAGE_KEY,
      JSON.stringify({ openid: 'o', phone: '13900000002' }),
    );
    const fetchMock = stubControl({ ok: true });
    await expect(
      emulationPlatform.requestPayment({ outTradeNo: 'P9', params: jsapi }),
    ).resolves.toEqual({ kind: 'paid' });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/__e2e/mini/request-payment');
    expect(bodyOf(fetchMock)).toEqual({ outTradeNo: 'P9', package: 'prepay_id=wx1' });

    window.localStorage.setItem(
      EMULATION_STORAGE_KEY,
      JSON.stringify({ openid: 'o', phone: '13900000002', payment: 'cancel' }),
    );
    await expect(
      emulationPlatform.requestPayment({ outTradeNo: 'P9', params: jsapi }),
    ).resolves.toEqual({ kind: 'cancelled' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails loudly when the harness is not there', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('not found', { status: 404 }))),
    );
    await expect(emulationPlatform.login()).rejects.toThrow(/login-code 失败 \(404/);
  });
});
