import {
  requestMiniProgramPayment,
  requestWechatBrowserPayment,
  redirectExternalBrowserPayment,
} from '../utils/wechatPayment.js';

/**
 * The three ways the shop hands a WeChat Pay JSAPI config to the phone: the
 * mini-program API, the WeChat browser's JS-SDK, and a redirect for an
 * external browser. The server's `jsConfig` spells `timestamp`; the
 * mini-program API wants `timeStamp`.
 */

const jsConfig = {
  timestamp: '123',
  nonceStr: 'nonce',
  package: 'prepay_id=1',
  signType: 'RSA',
  paySign: 'signature',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('requestMiniProgramPayment', () => {
  it('passes the config to uni.requestPayment with timeStamp renamed and the callbacks spread in', () => {
    const requestPayment = vi.fn();
    vi.stubGlobal('uni', { requestPayment });
    const success = () => {};
    requestMiniProgramPayment(jsConfig, { success });
    expect(requestPayment).toHaveBeenCalledWith({
      timeStamp: '123',
      nonceStr: 'nonce',
      package: 'prepay_id=1',
      signType: 'RSA',
      paySign: 'signature',
      success,
    });
  });

  it('prefers uni.requestOrderPayment when the base library has it', () => {
    const requestPayment = vi.fn();
    const requestOrderPayment = vi.fn();
    vi.stubGlobal('uni', { requestPayment, requestOrderPayment });
    requestMiniProgramPayment(jsConfig, {});
    expect(requestOrderPayment).toHaveBeenCalledOnce();
    expect(requestPayment).not.toHaveBeenCalled();
  });
});

describe('requestWechatBrowserPayment', () => {
  it('hands the config to the JS-SDK unchanged and returns what it returns', () => {
    const paid = Promise.resolve('paid');
    const pay = vi.fn(() => paid);
    expect(requestWechatBrowserPayment({ pay }, jsConfig)).toBe(paid);
    expect(pay).toHaveBeenCalledWith(jsConfig);
  });
});

describe('redirectExternalBrowserPayment', () => {
  it('leaves for the payment page after 1.5 s, not before', () => {
    vi.useFakeTimers();
    vi.stubGlobal('location', { href: '' });
    redirectExternalBrowserPayment('https://example.test/pay');
    vi.advanceTimersByTime(1499);
    expect(location.href).toBe('');
    vi.advanceTimersByTime(1);
    expect(location.href).toBe('https://example.test/pay');
  });
});
