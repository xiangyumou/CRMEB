import {
  createCipheriv,
  createPublicKey,
  createSign,
  createVerify,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Fake WeChat Pay v3 gateway — **skeleton**.
 *
 * Why it exists now, in Phase 0: the production credentials are not
 * configured and the site is blocked at the edge (PLAN §Context), so the only
 * way payment and refund can ever be tested is against a gateway we control.
 * PLAN §7 lists "微信支付 v3 无凭据无法实测" as a top risk, mitigated by
 * signature vector tests and a fake gateway.
 *
 * What works today, and must keep working:
 *  - a real RSA-2048 key pair, generated per instance;
 *  - real `Wechatpay-Signature` generation over the documented
 *    `timestamp\nnonce\nbody\n` message, and verification of what the app signs;
 *  - real `AEAD_AES_256_GCM` encryption of the notify `resource`;
 *  - the four endpoint shapes, with the request recorded so a test can assert
 *    on what the client sent;
 *  - `postNotify()`, which delivers a correctly signed callback to the app.
 *
 * What is deliberately a stub, for **stream C** to finish:
 *  - business rules (amount checks, state machine, partial refunds);
 *  - the platform-certificate download endpoint beyond a single static cert;
 *  - error responses for the failure codes C needs to handle.
 * Every one of those is marked `TODO(C)`.
 */

export interface FakeWechatKeys {
  /** Merchant private key the *app* signs its requests with. */
  merchantPrivateKeyPem: string;
  merchantSerial: string;
  /** Platform key the *gateway* signs notifications with. */
  platformPrivateKeyPem: string;
  platformPublicKeyPem: string;
  platformSerial: string;
  /** APIv3 key used for AEAD_AES_256_GCM. Exactly 32 bytes. */
  apiV3Key: string;
  mchId: string;
  appId: string;
}

export function generateFakeWechatKeys(): FakeWechatKeys {
  const merchant = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const platform = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    merchantPrivateKeyPem: merchant.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    merchantSerial: randomBytes(20).toString('hex').toUpperCase(),
    platformPrivateKeyPem: platform.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    platformPublicKeyPem: platform.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    platformSerial: randomBytes(20).toString('hex').toUpperCase(),
    apiV3Key: randomBytes(16).toString('hex'), // 32 ASCII chars
    mchId: '1900000001',
    appId: 'wx0000000000000001',
  };
}

/** The exact message WeChat Pay v3 signs: `timestamp\nnonce\nbody\n`. */
export function signatureMessage(timestamp: string, nonce: string, body: string): string {
  return `${timestamp}\n${nonce}\n${body}\n`;
}

export function signWithKey(privateKeyPem: string, message: string): string {
  return createSign('RSA-SHA256').update(message, 'utf8').sign(privateKeyPem, 'base64');
}

export function verifyWithKey(
  publicKeyPem: string,
  message: string,
  signatureBase64: string,
): boolean {
  return createVerify('RSA-SHA256')
    .update(message, 'utf8')
    .verify(publicKeyPem, signatureBase64, 'base64');
}

/** `AEAD_AES_256_GCM`, the envelope every v3 notification body uses. */
export function encryptResource(
  apiV3Key: string,
  plaintext: string,
  associatedData: string,
): { ciphertext: string; nonce: string; associated_data: string; algorithm: string } {
  const nonce = randomBytes(12).toString('hex').slice(0, 12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(apiV3Key, 'utf8'), Buffer.from(nonce));
  cipher.setAAD(Buffer.from(associatedData, 'utf8'));
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    algorithm: 'AEAD_AES_256_GCM',
    ciphertext: Buffer.concat([encrypted, cipher.getAuthTag()]).toString('base64'),
    nonce,
    associated_data: associatedData,
  };
}

export interface RecordedCall {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
  /** Whether the app's own `Authorization` signature verified. */
  signatureValid: boolean | null;
}

export interface FakeTransaction {
  outTradeNo: string;
  transactionId: string;
  amountFen: number;
  tradeState: 'NOTPAY' | 'SUCCESS' | 'CLOSED' | 'REFUND';
  openid: string;
}

export interface FakeWechatGateway {
  url: string;
  port: number;
  keys: FakeWechatKeys;
  /** Every request the app made, in order. */
  calls: RecordedCall[];
  transactions: Map<string, FakeTransaction>;
  /** Marks a transaction paid, as if the shopper completed payment. */
  markPaid(outTradeNo: string): FakeTransaction;
  /**
   * Delivers a signed `transaction.success` callback to the app.
   * Returns the app's HTTP status and body so the test can assert the ack.
   */
  postNotify(
    notifyUrl: string,
    input: { outTradeNo: string; eventType?: string; resource?: Record<string, unknown> },
  ): Promise<{ status: number; body: string }>;
  close(): Promise<void>;
  server: Server;
}

export async function startFakeWechatGateway(
  options: { keys?: FakeWechatKeys; port?: number } = {},
): Promise<FakeWechatGateway> {
  const keys = options.keys ?? generateFakeWechatKeys();
  const calls: RecordedCall[] = [];
  const transactions = new Map<string, FakeTransaction>();

  const server = createServer((req, res) => {
    void route(req, res);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, '127.0.0.1', resolve);
  });
  const port = (server.address() as AddressInfo).port;

  async function readJson(req: IncomingMessage): Promise<{ raw: string; parsed: unknown }> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString('utf8');
    try {
      return { raw, parsed: raw.length > 0 ? JSON.parse(raw) : undefined };
    } catch {
      return { raw, parsed: undefined };
    }
  }

  /**
   * Verifies the `Authorization: WECHATPAY2-SHA256-RSA2048 …` header the app
   * must send. Returns `null` when no header was present — a test asserting
   * "the client signs its requests" checks for `true`, not for absence.
   */
  function verifyAppSignature(req: IncomingMessage, body: string): boolean | null {
    const header = req.headers.authorization;
    if (typeof header !== 'string' || !header.includes('WECHATPAY2-SHA256-RSA2048')) return null;
    const field = (name: string) => new RegExp(`${name}="([^"]*)"`).exec(header)?.[1] ?? '';
    const message = `${(req.method ?? 'GET').toUpperCase()}\n${req.url}\n${field('timestamp')}\n${field('nonce_str')}\n${body}\n`;
    const merchantPublic = keys.merchantPrivateKeyPem
      ? publicFromPrivate(keys.merchantPrivateKeyPem)
      : '';
    try {
      return verifyWithKey(merchantPublic, message, field('signature'));
    } catch {
      return false;
    }
  }

  function reply(res: ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = randomUUID().replace(/-/g, '').slice(0, 32);
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      // Responses are signed exactly like notifications, which is what the
      // app's response verifier must check.
      'wechatpay-timestamp': timestamp,
      'wechatpay-nonce': nonce,
      'wechatpay-serial': keys.platformSerial,
      'wechatpay-signature': signWithKey(
        keys.platformPrivateKeyPem,
        signatureMessage(timestamp, nonce, payload),
      ),
    });
    res.end(payload);
  }

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const { raw, parsed } = await readJson(req);
    const url = new URL(req.url ?? '/', 'http://wxpay.local');
    calls.push({
      method: (req.method ?? 'GET').toUpperCase(),
      path: url.pathname,
      headers: Object.fromEntries(
        Object.entries(req.headers).map(([k, v]) => [
          k,
          Array.isArray(v) ? v.join(',') : (v ?? ''),
        ]),
      ),
      body: parsed,
      signatureValid: verifyAppSignature(req, raw),
    });

    const method = (req.method ?? 'GET').toUpperCase();
    const body = (parsed ?? {}) as Record<string, unknown>;

    // --- create transaction (JSAPI / H5 / native share this shape) ----------
    if (
      method === 'POST' &&
      /^\/v3\/pay\/transactions\/(jsapi|h5|native|app)$/.test(url.pathname)
    ) {
      const outTradeNo = String(body.out_trade_no ?? '');
      const amount = (body.amount ?? {}) as { total?: number };
      // TODO(C): reject a duplicate out_trade_no with ORDERPAID / ORDER_CLOSED,
      // validate mchid/appid, and honour `time_expire`.
      transactions.set(outTradeNo, {
        outTradeNo,
        transactionId: `42000${randomBytes(8).toString('hex')}`,
        amountFen: amount.total ?? 0,
        tradeState: 'NOTPAY',
        openid: String((body.payer as { openid?: string } | undefined)?.openid ?? 'oFakeOpenid'),
      });
      reply(res, 200, { prepay_id: `wx${randomBytes(16).toString('hex')}` });
      return;
    }

    // --- query by out_trade_no ---------------------------------------------
    const queryMatch = /^\/v3\/pay\/transactions\/out-trade-no\/([^/]+)$/.exec(url.pathname);
    if (method === 'GET' && queryMatch) {
      const transaction = transactions.get(decodeURIComponent(queryMatch[1]!));
      if (!transaction) {
        reply(res, 404, { code: 'ORDERNOTEXIST', message: '订单不存在' });
        return;
      }
      reply(res, 200, transactionBody(transaction, keys));
      return;
    }

    // --- close --------------------------------------------------------------
    const closeMatch = /^\/v3\/pay\/transactions\/out-trade-no\/([^/]+)\/close$/.exec(url.pathname);
    if (method === 'POST' && closeMatch) {
      const transaction = transactions.get(decodeURIComponent(closeMatch[1]!));
      // TODO(C): a SUCCESS transaction must fail to close with ORDERPAID —
      // that is exactly the payment-vs-cancel race in risk matrix §4.
      if (transaction && transaction.tradeState === 'NOTPAY') transaction.tradeState = 'CLOSED';
      res.writeHead(204).end();
      return;
    }

    // --- refund -------------------------------------------------------------
    if (method === 'POST' && url.pathname === '/v3/refund/domestic/refunds') {
      const transaction = transactions.get(String(body.out_trade_no ?? ''));
      if (transaction) transaction.tradeState = 'REFUND';
      // TODO(C): partial refunds, refund state callbacks, NOTENOUGH/... errors.
      reply(res, 200, {
        refund_id: `50000${randomBytes(8).toString('hex')}`,
        out_refund_no: String(body.out_refund_no ?? ''),
        transaction_id: transaction?.transactionId ?? '',
        out_trade_no: String(body.out_trade_no ?? ''),
        channel: 'ORIGINAL',
        status: 'PROCESSING',
      });
      return;
    }

    // --- platform certificates ---------------------------------------------
    if (method === 'GET' && url.pathname === '/v3/certificates') {
      // TODO(C): return a real encrypted certificate payload once the client
      // does certificate rotation. The public key is exposed via `keys`.
      reply(res, 200, {
        data: [{ serial_no: keys.platformSerial, effective_time: new Date().toISOString() }],
      });
      return;
    }

    reply(res, 404, {
      code: 'RESOURCE_NOT_EXISTS',
      message: `fake gateway: ${url.pathname} 未实现`,
    });
  }

  return {
    url: `http://127.0.0.1:${port}`,
    port,
    keys,
    calls,
    transactions,
    server,
    markPaid(outTradeNo) {
      const transaction = transactions.get(outTradeNo);
      if (!transaction) throw new Error(`fake gateway: 未知交易 ${outTradeNo}`);
      transaction.tradeState = 'SUCCESS';
      return transaction;
    },
    async postNotify(notifyUrl, input) {
      const transaction = transactions.get(input.outTradeNo);
      if (!transaction) throw new Error(`fake gateway: 未知交易 ${input.outTradeNo}`);
      const plaintext = JSON.stringify(
        input.resource ?? transactionBody({ ...transaction, tradeState: 'SUCCESS' }, keys),
      );
      const notification = {
        id: randomUUID(),
        create_time: new Date().toISOString(),
        event_type: input.eventType ?? 'TRANSACTION.SUCCESS',
        resource_type: 'encrypt-resource',
        summary: '支付成功',
        resource: encryptResource(keys.apiV3Key, plaintext, 'transaction'),
      };
      const payload = JSON.stringify(notification);
      const timestamp = String(Math.floor(Date.now() / 1000));
      const nonce = randomUUID().replace(/-/g, '').slice(0, 32);

      const response = await fetch(notifyUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'wechatpay-timestamp': timestamp,
          'wechatpay-nonce': nonce,
          'wechatpay-serial': keys.platformSerial,
          'wechatpay-signature': signWithKey(
            keys.platformPrivateKeyPem,
            signatureMessage(timestamp, nonce, payload),
          ),
        },
        body: payload,
      });
      return { status: response.status, body: await response.text() };
    },
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

function transactionBody(transaction: FakeTransaction, keys: FakeWechatKeys) {
  return {
    appid: keys.appId,
    mchid: keys.mchId,
    out_trade_no: transaction.outTradeNo,
    transaction_id: transaction.transactionId,
    trade_type: 'JSAPI',
    trade_state: transaction.tradeState,
    trade_state_desc: transaction.tradeState === 'SUCCESS' ? '支付成功' : '订单未支付',
    bank_type: 'OTHERS',
    success_time: new Date().toISOString(),
    payer: { openid: transaction.openid },
    amount: { total: transaction.amountFen, payer_total: transaction.amountFen, currency: 'CNY' },
  };
}

/** Derives the public key of a PKCS#8 private key, for verifying what the app signed. */
function publicFromPrivate(privateKeyPem: string): string {
  return createPublicKey(privateKeyPem).export({ type: 'spki', format: 'pem' }).toString();
}
