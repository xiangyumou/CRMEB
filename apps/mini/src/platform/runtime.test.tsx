import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { taroFake } from '@/test/taro-fake/taro';
import { platform } from './runtime';

const jsapi = {
  appId: 'wxmini',
  timeStamp: '1700000000',
  nonceStr: 'n',
  package: 'prepay_id=wx1',
  signType: 'RSA' as const,
  paySign: 'sig',
};

describe('weapp platform', () => {
  it('is wechat-mini over Taro.request', () => {
    expect(platform.kind).toBe('weapp');
    expect(platform.api.clientPlatform).toBe('wechat-mini');
  });

  it('returns the wx.login code', async () => {
    taroFake.loginCode = 'abc';
    await expect(platform.login()).resolves.toBe('abc');
  });

  it('passes the jsapi parameters to wx.requestPayment and maps its outcome', async () => {
    await expect(platform.requestPayment({ outTradeNo: 'P1', params: jsapi })).resolves.toEqual({
      kind: 'paid',
    });
    expect(taroFake.calls).toContainEqual({
      api: 'requestPayment',
      args: {
        timeStamp: '1700000000',
        nonceStr: 'n',
        package: 'prepay_id=wx1',
        signType: 'RSA',
        paySign: 'sig',
      },
    });

    taroFake.paymentError = 'requestPayment:fail cancel';
    await expect(platform.requestPayment({ outTradeNo: 'P1', params: jsapi })).resolves.toEqual({
      kind: 'cancelled',
    });

    taroFake.paymentError = 'requestPayment:fail 系统错误';
    await expect(platform.requestPayment({ outTradeNo: 'P1', params: jsapi })).resolves.toEqual({
      kind: 'failed',
      message: 'requestPayment:fail 系统错误',
    });
  });

  it('reports the phone code, or a refusal, from the getPhoneNumber button', () => {
    const onResult = vi.fn();
    render(<platform.PhoneNumberButton onResult={onResult}>手机号</platform.PhoneNumberButton>);
    fireEvent.click(screen.getByRole('button', { name: '手机号' }));
    expect(onResult).toHaveBeenLastCalledWith({ ok: true, code: 'fake-phone-code' });

    taroFake.phoneNumberDetail = { errMsg: 'getPhoneNumber:fail user deny' };
    fireEvent.click(screen.getByRole('button', { name: '手机号' }));
    expect(onResult).toHaveBeenLastCalledWith({
      ok: false,
      reason: 'denied',
      message: '已取消授权',
    });
  });

  it("opens WeChat's 确认收货 component with its own keys and maps how it ended", async () => {
    await expect(platform.openOrderConfirm({ transactionId: '4200' })).resolves.toEqual({
      kind: 'confirmed',
    });
    expect(taroFake.calls).toContainEqual({
      api: 'openBusinessView',
      args: { businessType: 'weappOrderConfirm', extraData: { transaction_id: '4200' } },
    });
    await platform.openOrderConfirm({ merchantId: 'm1', merchantTradeNo: 'P1' });
    expect(taroFake.calls.at(-1)?.args).toEqual({
      businessType: 'weappOrderConfirm',
      extraData: { merchant_id: 'm1', merchant_trade_no: 'P1' },
    });

    taroFake.businessViewStatus = 'cancel';
    await expect(platform.openOrderConfirm({ transactionId: '4200' })).resolves.toEqual({
      kind: 'cancelled',
    });
    taroFake.businessViewStatus = 'fail';
    await expect(platform.openOrderConfirm({ transactionId: '4200' })).resolves.toMatchObject({
      kind: 'failed',
    });
  });
});
