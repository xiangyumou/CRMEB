import { randomUUID } from 'node:crypto';
import { createServer, request as httpRequest, type Server } from 'node:http';

import { signatureMessage, signWithKey, type FakeWechatGateway } from '@shop/testing';

/**
 * A pass-through in front of the fake WeChat Pay gateway that fills in the one
 * field the fake does not answer: `h5_url`.
 *
 * WeChat's `POST /v3/pay/transactions/h5` answers `{ "h5_url": "…" }` — the
 * page a phone browser is sent to so the shopper can pay. `@shop/testing`'s
 * fake answers every create (JSAPI, H5, native) with `{ prepay_id }`, so
 * `createH5Transaction` in `core/src/wechat/wechat.pay.ts` refuses the answer
 * (`PAYMENT_STATE_UNKNOWN`, `no-h5-url`) and a shopper on the H5 build can
 * never start a payment against it. That gap is CR-5-i; this shim is what
 * the suite does until the fake answers H5 itself, and goes away then.
 *
 * Every other request and response passes through byte for byte. The one
 * response it rewrites is re-signed with the fake's own platform key — the
 * key `paymentConfig` trusts — so the app's response verification still runs
 * for real, on real signatures, exactly as it would against WeChat.
 *
 * The `h5_url` it hands out is `GET <control>/h5-cashier`
 * (`src/gateway-control.ts`), which sends the browser straight back to the
 * `redirect_url` the app appended — WeChat's own cashier does the same once
 * the shopper has paid or given up. Settling the payment is still the
 * spec's job, through `complete-payment`.
 */
export interface H5PayShimOptions {
  gateway: FakeWechatGateway;
  /** Where the shim's `h5_url` points: the control plane's `/h5-cashier`. */
  cashierUrl: string;
  port?: number;
}

export interface H5PayShim {
  url: string;
  close(): Promise<void>;
}

const H5_CREATE = '/v3/pay/transactions/h5';

export async function startH5PayShim(options: H5PayShimOptions): Promise<H5PayShim> {
  const upstream = new URL(options.gateway.url);
  const { platformPrivateKeyPem, platformSerial } = options.gateway.keys;

  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const forwarded = httpRequest(
        {
          hostname: upstream.hostname,
          port: upstream.port,
          path: req.url,
          method: req.method,
          headers: { ...req.headers, host: upstream.host },
        },
        (upstreamRes) => {
          const parts: Buffer[] = [];
          upstreamRes.on('data', (chunk: Buffer) => parts.push(chunk));
          upstreamRes.on('end', () => {
            const raw = Buffer.concat(parts);
            const isH5Create =
              req.method === 'POST' && req.url === H5_CREATE && upstreamRes.statusCode === 200;
            if (!isH5Create) {
              res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
              res.end(raw);
              return;
            }
            const answer = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
            const sent = JSON.parse(body.toString('utf8')) as { out_trade_no?: string };
            if (typeof answer.h5_url !== 'string') {
              const cashier = new URL(options.cashierUrl);
              cashier.searchParams.set('out_trade_no', String(sent.out_trade_no ?? ''));
              answer.h5_url = cashier.toString();
              delete answer.prepay_id;
            }
            const payload = JSON.stringify(answer);
            const timestamp = String(Math.floor(Date.now() / 1000));
            const nonce = randomUUID().replace(/-/g, '');
            res.writeHead(200, {
              'content-type': 'application/json; charset=utf-8',
              'wechatpay-timestamp': timestamp,
              'wechatpay-nonce': nonce,
              'wechatpay-serial': platformSerial,
              'wechatpay-signature': signWithKey(
                platformPrivateKeyPem,
                signatureMessage(timestamp, nonce, payload),
              ),
            });
            res.end(payload);
          });
        },
      );
      forwarded.on('error', (error) => {
        res.writeHead(502, { 'content-type': 'text/plain' });
        res.end(`h5 pay shim: ${error.message}`);
      });
      forwarded.end(body);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : options.port!;

  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
