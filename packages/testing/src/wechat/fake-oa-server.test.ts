import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startFakeOaServer, type FakeOaServer } from './fake-oa-server';

/**
 * The fake `api.weixin.qq.com` refuses what WeChat refuses. Here: a
 * `wx.login()` or `getPhoneNumber` code is good exactly once.
 */

let oa: FakeOaServer;

beforeAll(async () => {
  oa = await startFakeOaServer();
});

afterAll(async () => {
  await oa?.close();
});

beforeEach(() => {
  oa.reset();
});

async function jscode2session(code: string): Promise<Record<string, unknown>> {
  const url = new URL(`${oa.url}/sns/jscode2session`);
  url.searchParams.set('appid', oa.miniAppId);
  url.searchParams.set('secret', oa.miniAppSecret);
  url.searchParams.set('js_code', code);
  url.searchParams.set('grant_type', 'authorization_code');
  return (await (await fetch(url)).json()) as Record<string, unknown>;
}

async function miniToken(): Promise<string> {
  const url = new URL(`${oa.url}/cgi-bin/token`);
  url.searchParams.set('grant_type', 'client_credential');
  url.searchParams.set('appid', oa.miniAppId);
  url.searchParams.set('secret', oa.miniAppSecret);
  const body = (await (await fetch(url)).json()) as { access_token: string };
  return body.access_token;
}

async function phoneNumber(code: string): Promise<Record<string, unknown>> {
  const token = await miniToken();
  const response = await fetch(
    `${oa.url}/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    },
  );
  return (await response.json()) as Record<string, unknown>;
}

describe('mini-program codes are single-use', () => {
  it('redeems a wx.login() code once, then answers 40163', async () => {
    oa.setMiniCode('login-once', { openid: 'oMINI_once', unionid: 'uUNION_once' });

    expect(await jscode2session('login-once')).toMatchObject({
      openid: 'oMINI_once',
      unionid: 'uUNION_once',
    });
    expect(await jscode2session('login-once')).toEqual({
      errcode: 40163,
      errmsg: 'code been used',
    });
  });

  it('answers 40029 for a code it never issued', async () => {
    expect(await jscode2session('never-issued')).toEqual({
      errcode: 40029,
      errmsg: 'invalid code',
    });
  });

  it('redeems a getPhoneNumber code once, then answers 40163', async () => {
    oa.setPhoneCode('phone-once', { phone: '13800000000' });

    expect(await phoneNumber('phone-once')).toMatchObject({
      errcode: 0,
      phone_info: { purePhoneNumber: '13800000000' },
    });
    expect(await phoneNumber('phone-once')).toEqual({ errcode: 40163, errmsg: 'code been used' });
  });

  it('forgets spent codes on reset', async () => {
    oa.setMiniCode('login-reset', { openid: 'oMINI_reset' });
    await jscode2session('login-reset');
    oa.reset();
    expect(await jscode2session('login-reset')).toMatchObject({ errcode: 40029 });
  });
});
