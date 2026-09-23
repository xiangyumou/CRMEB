import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { smsConfig } from '../system';
import { canonicalQuery, createAliyunSmsSender, percentEncode, signatureFor } from './sms-aliyun';
import { fakeSmsSender } from './sms.fake';
import { nullSmsSender } from './sms.port';
import { smsProviderConfigured } from './sms.service';
import { CODE_LENGTH, codeKey, generateCode, resendKey } from './verification-code';

describe('percentEncode', () => {
  it('differs from encodeURIComponent exactly where Aliyun requires', () => {
    // The documented trap: RFC 3986 escapes `!'()*` and `encodeURIComponent`
    // does not. `~` must stay unescaped, which JavaScript already does.
    expect(percentEncode("!'()*")).toBe('%21%27%28%29%2A');
    expect(encodeURIComponent("!'()*")).toBe("!'()*");
    expect(percentEncode('~')).toBe('~');
  });

  it('escapes the characters a template parameter really contains', () => {
    expect(percentEncode('{"code":"012345"}')).toBe('%7B%22code%22%3A%22012345%22%7D');
  });
});

describe('canonicalQuery', () => {
  it('sorts by key and encodes both halves', () => {
    expect(canonicalQuery({ b: '2', a: '1', 'A~': '*' })).toBe('A~=%2A&a=1&b=2');
  });

  it('sorts ASCII-wise, so uppercase comes before lowercase', () => {
    // `Action` before `accessKey` — a locale-aware sort would swap them and
    // every signature would be rejected.
    expect(canonicalQuery({ accessKey: 'x', Action: 'SendSms' })).toBe(
      'Action=SendSms&accessKey=x',
    );
  });
});

describe('signatureFor', () => {
  it('signs `GET&%2F&<canonical query>` with a trailing-& key', () => {
    const params = { Action: 'SendSms', PhoneNumbers: '13800138000' };
    // Written out literally rather than rebuilt from the helpers: this is the
    // assertion, and deriving it from the code under test would prove nothing.
    const expected = createHmac('sha1', 'secret&')
      .update('GET&%2F&Action%3DSendSms%26PhoneNumbers%3D13800138000', 'utf8')
      .digest('base64');
    expect(signatureFor(params, 'secret')).toBe(expected);
  });
});

describe('createAliyunSmsSender', () => {
  const options = {
    accessKeyId: 'id',
    accessKeySecret: 'secret',
    regionId: 'cn-hangzhou',
    signName: '商城',
    now: () => new Date('2026-09-22T01:02:03.456Z'),
    nonce: () => 'fixed-nonce',
  };

  it('sends a signed GET with a second-resolution timestamp', async () => {
    let seen = '';
    const sender = createAliyunSmsSender({
      ...options,
      fetchImpl: async (url) => {
        seen = String(url);
        return new Response(JSON.stringify({ Code: 'OK', BizId: 'biz-1' }));
      },
    });

    const result = await sender.send({
      phone: '13800138000',
      templateId: 'SMS_1',
      params: { code: '012345' },
    });

    expect(result).toEqual({ ok: true, messageId: 'biz-1' });
    // Aliyun rejects a timestamp carrying milliseconds.
    expect(seen).toContain('Timestamp=2026-09-22T01%3A02%3A03Z');
    expect(seen).toContain('SignatureNonce=fixed-nonce');
    expect(seen).toContain('&Signature=');
  });

  it('turns a provider refusal into a result, never a throw', async () => {
    const sender = createAliyunSmsSender({
      ...options,
      fetchImpl: async () =>
        new Response(JSON.stringify({ Code: 'isv.BUSINESS_LIMIT_CONTROL', Message: '触发限流' })),
    });
    await expect(
      sender.send({ phone: '13800138000', templateId: 'SMS_1', params: {} }),
    ).resolves.toEqual({
      ok: false,
      providerCode: 'isv.BUSINESS_LIMIT_CONTROL',
      error: '触发限流',
    });
  });

  it('turns a transport failure into a result too', async () => {
    // A DNS failure at 3am must be a 502 the shopper can retry, not a 500 and
    // a page of stack trace in the log.
    const sender = createAliyunSmsSender({
      ...options,
      fetchImpl: () => Promise.reject(new Error('getaddrinfo ENOTFOUND')),
    });
    const result = await sender.send({ phone: '13800138000', templateId: 'SMS_1', params: {} });
    expect(result.ok).toBe(false);
    expect(result.providerCode).toBe('TRANSPORT');
  });
});

describe('nullSmsSender', () => {
  it('refuses rather than pretending to have sent', async () => {
    // The tempting alternative — log the code and return ok — turns an
    // unconfigured production shop into one where the code is in the log file.
    const result = await nullSmsSender.send({
      phone: '13800138000',
      templateId: '',
      params: { code: '000000' },
    });
    expect(result.ok).toBe(false);
    expect(result.providerCode).toBe('NOT_CONFIGURED');
  });
});

describe('fakeSmsSender', () => {
  it('records what was sent and can be told to fail', async () => {
    const fake = fakeSmsSender();
    await fake.send({ phone: '13800138000', templateId: 'SMS_1', params: { code: '123456' } });
    expect(fake.lastCodeFor('13800138000')).toBe('123456');

    fake.failNext(1, { ok: false, providerCode: 'isv.OUT_OF_SERVICE' });
    await expect(
      fake.send({ phone: '13800138000', templateId: 'SMS_1', params: { code: '654321' } }),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      fake.send({ phone: '13800138000', templateId: 'SMS_1', params: { code: '111111' } }),
    ).resolves.toMatchObject({ ok: true });
  });
});

describe('verification code keys', () => {
  it('puts the scene in the key', () => {
    // Keyed on the phone number alone, a code sent to confirm a phone change
    // would also log you in.
    expect(codeKey('login', '13800138000')).toBe('sms:code:login:13800138000');
    expect(codeKey('bind-phone', '13800138000')).not.toBe(codeKey('login', '13800138000'));
  });

  it('keeps the resend guard in a separate key from the code', () => {
    // They have different lifetimes: consuming a code must not let the same
    // number immediately ask for another.
    expect(resendKey('login', '13800138000')).toBe('sms:resend:login:13800138000');
  });
});

describe('generateCode', () => {
  it('is always six digits, including the ones starting with zero', () => {
    // `rand(100000, 999999)` threw away a tenth of the space for nothing.
    for (let i = 0; i < 500; i += 1) {
      expect(generateCode()).toMatch(/^\d{6}$/);
    }
    expect(CODE_LENGTH).toBe(6);
  });

  it('covers the leading-zero range', () => {
    const codes = Array.from({ length: 2000 }, () => generateCode());
    expect(codes.some((code) => code.startsWith('0'))).toBe(true);
  });
});

/**
 * `resolveSender`'s rule, as the predicate `GET /api/v1/site/config` asks — the
 * same function `resolveSender` itself calls, so the two cannot disagree about
 * whether a code can be sent.
 */
describe('smsProviderConfigured', () => {
  const config = (values: Record<string, unknown>) => smsConfig.schema.parse(values);
  const ALIYUN = {
    provider: 'aliyun',
    aliyunAccessKeyId: 'LTAI-test',
    aliyunAccessKeySecret: 'secret',
    aliyunSignName: '示例商城',
  };

  it('is true for Aliyun with its key id, key secret and sign name', () => {
    expect(smsProviderConfigured(config(ALIYUN))).toBe(true);
  });

  it('is false while any of the three is blank', () => {
    for (const key of ['aliyunAccessKeyId', 'aliyunAccessKeySecret', 'aliyunSignName']) {
      expect(smsProviderConfigured(config({ ...ALIYUN, [key]: '' }))).toBe(false);
    }
  });

  it('is false for 不启用, and for Tencent however complete (declared, not implemented)', () => {
    expect(smsProviderConfigured(config({ ...ALIYUN, provider: 'none' }))).toBe(false);
    expect(smsProviderConfigured(config({}))).toBe(false);
    expect(
      smsProviderConfigured(
        config({
          provider: 'tencent',
          tencentAppId: '1400000000',
          tencentSecretId: 'id',
          tencentSecretKey: 'key',
          tencentSignName: '示例商城',
        }),
      ),
    ).toBe(false);
  });
});
