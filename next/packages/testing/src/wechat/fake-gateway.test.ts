import { createDecipheriv, createSign } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  encryptResource,
  generateFakeWechatKeys,
  signatureMessage,
  signWithKey,
  startFakeWechatGateway,
  verifyWithKey,
  type FakeWechatGateway,
} from './fake-gateway';

/**
 * The fake gateway is a skeleton for stream C, but the *crypto plumbing* has to
 * be real today — a fake that signs incorrectly would teach C's verifier to be
 * wrong too.
 */

let gateway: FakeWechatGateway;

beforeAll(async () => {
  gateway = await startFakeWechatGateway();
});

afterAll(async () => {
  await gateway?.close();
});

async function createTransaction(outTradeNo: string, total = 1990): Promise<Response> {
  return fetch(`${gateway.url}/v3/pay/transactions/jsapi`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      appid: gateway.keys.appId,
      mchid: gateway.keys.mchId,
      out_trade_no: outTradeNo,
      amount: { total, currency: 'CNY' },
      payer: { openid: 'oTestOpenid' },
    }),
  });
}

describe('signature primitives', () => {
  it('signs and verifies the documented message', () => {
    const keys = generateFakeWechatKeys();
    const message = signatureMessage('1700000000', 'abc', '{"a":1}');
    expect(message).toBe('1700000000\nabc\n{"a":1}\n');

    const signature = signWithKey(keys.platformPrivateKeyPem, message);
    expect(verifyWithKey(keys.platformPublicKeyPem, message, signature)).toBe(true);
    expect(verifyWithKey(keys.platformPublicKeyPem, `${message}tampered`, signature)).toBe(false);
  });

  it('encrypts a resource the way v3 notifications do', () => {
    const keys = generateFakeWechatKeys();
    const resource = encryptResource(keys.apiV3Key, '{"trade_state":"SUCCESS"}', 'transaction');
    expect(resource.algorithm).toBe('AEAD_AES_256_GCM');
    expect(resource.associated_data).toBe('transaction');

    // Decrypt exactly as the real client must.
    const raw = Buffer.from(resource.ciphertext, 'base64');
    const tag = raw.subarray(raw.length - 16);
    const data = raw.subarray(0, raw.length - 16);
    const decipher = createDecipheriv(
      'aes-256-gcm',
      Buffer.from(keys.apiV3Key, 'utf8'),
      Buffer.from(resource.nonce),
    );
    decipher.setAAD(Buffer.from(resource.associated_data, 'utf8'));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    expect(JSON.parse(plaintext)).toEqual({ trade_state: 'SUCCESS' });
  });

  it('uses a 32-byte APIv3 key, as AES-256 requires', () => {
    expect(Buffer.byteLength(generateFakeWechatKeys().apiV3Key, 'utf8')).toBe(32);
  });
});

describe('the endpoints', () => {
  it('creates a transaction and returns a prepay_id', async () => {
    const response = await createTransaction('T1');
    expect(response.status).toBe(200);
    expect((await response.json()).prepay_id).toMatch(/^wx[0-9a-f]{32}$/);
    expect(gateway.transactions.get('T1')).toMatchObject({
      amountFen: 1990,
      tradeState: 'NOTPAY',
    });
  });

  it('signs its own responses', async () => {
    const response = await createTransaction('T-signed');
    const timestamp = response.headers.get('wechatpay-timestamp')!;
    const nonce = response.headers.get('wechatpay-nonce')!;
    const signature = response.headers.get('wechatpay-signature')!;
    expect(response.headers.get('wechatpay-serial')).toBe(gateway.keys.platformSerial);

    const payload = JSON.stringify(await response.json());
    expect(
      verifyWithKey(
        gateway.keys.platformPublicKeyPem,
        signatureMessage(timestamp, nonce, payload),
        signature,
      ),
    ).toBe(true);
  });

  it('queries a transaction by out_trade_no', async () => {
    await createTransaction('T2');
    const response = await fetch(`${gateway.url}/v3/pay/transactions/out-trade-no/T2`);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({ out_trade_no: 'T2', trade_state: 'NOTPAY' });
    expect(payload.amount.total).toBe(1990);
  });

  it('404s an unknown out_trade_no with a WeChat-shaped error', async () => {
    const response = await fetch(`${gateway.url}/v3/pay/transactions/out-trade-no/nope`);
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe('ORDERNOTEXIST');
  });

  it('closes an unpaid transaction with 204', async () => {
    await createTransaction('T3');
    const response = await fetch(`${gateway.url}/v3/pay/transactions/out-trade-no/T3/close`, {
      method: 'POST',
      body: '{}',
    });
    expect(response.status).toBe(204);
    expect(gateway.transactions.get('T3')?.tradeState).toBe('CLOSED');
  });

  it('accepts a refund', async () => {
    await createTransaction('T4');
    gateway.markPaid('T4');
    const response = await fetch(`${gateway.url}/v3/refund/domestic/refunds`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ out_trade_no: 'T4', out_refund_no: 'R4', amount: { refund: 1990 } }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ out_refund_no: 'R4', status: 'PROCESSING' });
    expect(gateway.transactions.get('T4')?.tradeState).toBe('REFUND');
  });

  it('records every call so a test can assert what the client sent', async () => {
    const before = gateway.calls.length;
    await createTransaction('T5');
    const call = gateway.calls[before]!;
    expect(call.method).toBe('POST');
    expect(call.path).toBe('/v3/pay/transactions/jsapi');
    expect((call.body as { out_trade_no: string }).out_trade_no).toBe('T5');
  });

  it('verifies the Authorization signature when the client sends one', async () => {
    const body = JSON.stringify({ out_trade_no: 'T6', amount: { total: 100 } });
    const timestamp = '1700000000';
    const nonce = 'abcdef';
    const url = '/v3/pay/transactions/jsapi';
    const message = `POST\n${url}\n${timestamp}\n${nonce}\n${body}\n`;
    const signature = createSign('RSA-SHA256')
      .update(message)
      .sign(gateway.keys.merchantPrivateKeyPem, 'base64');

    const before = gateway.calls.length;
    await fetch(`${gateway.url}${url}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization:
          `WECHATPAY2-SHA256-RSA2048 mchid="${gateway.keys.mchId}",` +
          `nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",` +
          `serial_no="${gateway.keys.merchantSerial}"`,
      },
      body,
    });
    expect(gateway.calls[before]?.signatureValid).toBe(true);
  });

  it('flags a bad Authorization signature', async () => {
    const before = gateway.calls.length;
    await fetch(`${gateway.url}/v3/pay/transactions/jsapi`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization:
          'WECHATPAY2-SHA256-RSA2048 mchid="x",nonce_str="n",signature="bm90LWEtc2ln",timestamp="1"',
      },
      body: JSON.stringify({ out_trade_no: 'T7' }),
    });
    expect(gateway.calls[before]?.signatureValid).toBe(false);
  });

  it('reports an unimplemented endpoint clearly rather than hanging', async () => {
    const response = await fetch(`${gateway.url}/v3/pay/transactions/id/12345`);
    expect(response.status).toBe(404);
    expect((await response.json()).message).toContain('未实现');
  });
});

describe('postNotify', () => {
  let app: Server;
  let notifyUrl: string;
  const received: Array<{ headers: Record<string, string>; body: string }> = [];

  beforeAll(async () => {
    app = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        received.push({
          headers: Object.fromEntries(
            Object.entries(req.headers).map(([k, v]) => [k, String(v ?? '')]),
          ),
          body: Buffer.concat(chunks).toString('utf8'),
        });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ code: 'SUCCESS' }));
      });
    });
    await new Promise<void>((resolve) => app.listen(0, '127.0.0.1', resolve));
    notifyUrl = `http://127.0.0.1:${(app.address() as AddressInfo).port}/api/v1/payment/notify`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => app.close(() => resolve()));
  });

  it('delivers a correctly signed, correctly encrypted callback', async () => {
    await createTransaction('N1', 500);
    gateway.markPaid('N1');

    const result = await gateway.postNotify(notifyUrl, { outTradeNo: 'N1' });
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ code: 'SUCCESS' });

    const delivered = received.at(-1)!;
    const { headers, body } = delivered;

    // The signature the app's verifier has to check.
    expect(
      verifyWithKey(
        gateway.keys.platformPublicKeyPem,
        signatureMessage(headers['wechatpay-timestamp']!, headers['wechatpay-nonce']!, body),
        headers['wechatpay-signature']!,
      ),
    ).toBe(true);
    expect(headers['wechatpay-serial']).toBe(gateway.keys.platformSerial);

    const notification = JSON.parse(body);
    expect(notification.event_type).toBe('TRANSACTION.SUCCESS');
    expect(notification.resource.algorithm).toBe('AEAD_AES_256_GCM');

    const raw = Buffer.from(notification.resource.ciphertext, 'base64');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      Buffer.from(gateway.keys.apiV3Key, 'utf8'),
      Buffer.from(notification.resource.nonce),
    );
    decipher.setAAD(Buffer.from(notification.resource.associated_data, 'utf8'));
    decipher.setAuthTag(raw.subarray(raw.length - 16));
    const plaintext = JSON.parse(
      Buffer.concat([decipher.update(raw.subarray(0, raw.length - 16)), decipher.final()]).toString(
        'utf8',
      ),
    );
    expect(plaintext).toMatchObject({ out_trade_no: 'N1', trade_state: 'SUCCESS' });
    expect(plaintext.amount.total).toBe(500);
  });

  it('can deliver the same callback twice, for the duplicate-notify test C needs', async () => {
    await createTransaction('N2', 100);
    gateway.markPaid('N2');
    const first = await gateway.postNotify(notifyUrl, { outTradeNo: 'N2' });
    const second = await gateway.postNotify(notifyUrl, { outTradeNo: 'N2' });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  it('refuses to notify about a transaction it never created', async () => {
    await expect(gateway.postNotify(notifyUrl, { outTradeNo: 'nope' })).rejects.toThrow('未知交易');
  });
});
