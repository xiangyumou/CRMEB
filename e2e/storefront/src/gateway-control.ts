import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import type { FakeWechatGateway } from '@shop/testing';

/**
 * The bridge between the fake WeChat Pay gateway and a Playwright spec.
 *
 * `startFakeWechatGateway()` returns an in-process object — `scripts/serve.ts`
 * holds it, because that is the process that starts `web` and hands the
 * gateway's URL to `paymentConfig`. A spec runs in a *different* process (the
 * Playwright test runner), so it cannot call `gateway.markPaid()` directly the
 * way `payment.int.test.ts` does in the same process as the code under test.
 *
 * This is a second, tiny HTTP server, started alongside the gateway, that
 * exposes exactly the two operations the eight journeys need performed on the
 * live gateway instance:
 *
 *  - `complete-payment`: marks the transaction paid and delivers the signed
 *    async notification to `web`'s real webhook route, the same two steps a
 *    real WeChat payment completion is — because a shopper's browser can
 *    genuinely create the payment attempt (a real `POST .../payments` call)
 *    but headless Chromium cannot complete a WeChat H5 redirect;
 *  - `complete-refund`: settles a refund's gateway-side state so a spec is
 *    not stuck polling for `reconcileStaleRefunds()`'s sweep interval;
 *
 * Nothing here is a shortcut through domain code: both operations still go
 * through the real webhook route and the real signature the gateway would
 * produce for an actual WeChat notification, so what a spec proves is what
 * production would do once WeChat's own server delivered the callback.
 */

export interface GatewayControlOptions {
  gateway: FakeWechatGateway;
  /** The edge origin — where `notifyBaseUrl` in `paymentConfig` points. */
  baseUrl: string;
  port?: number;
}

export interface GatewayControl {
  url: string;
  close(): Promise<void>;
}

export async function startGatewayControl(options: GatewayControlOptions): Promise<GatewayControl> {
  const { gateway, baseUrl } = options;

  const server: Server = createServer((req, res) => {
    void handle(req, res);
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body =
        chunks.length > 0 ? (JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown) : {};

      if (req.method === 'POST' && req.url === '/complete-payment') {
        const { outTradeNo } = body as { outTradeNo: string };
        gateway.markPaid(outTradeNo);
        const result = await gateway.postNotify(`${baseUrl}/api/v1/webhooks/wechat-pay`, {
          outTradeNo,
        });
        respond(res, 200, result);
        return;
      }

      if (req.method === 'POST' && req.url === '/complete-refund') {
        const { outRefundNo } = body as { outRefundNo: string };
        gateway.markRefunded(outRefundNo, 'SUCCESS');
        const result = await gateway.postRefundNotify(`${baseUrl}/api/v1/webhooks/wechat-refund`, {
          outRefundNo,
        });
        respond(res, 200, result);
        return;
      }

      respond(res, 404, { error: 'not found' });
    } catch (error) {
      respond(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : options.port!;

  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

function respond(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(text),
  });
  res.end(text);
}

/**
 * The client side, used by specs. Plain `fetch` would do, but a named helper
 * keeps every spec's call to a one-liner and gives errors a place to become
 * readable instead of a bare non-2xx body.
 */
export async function completePayment(controlUrl: string, outTradeNo: string): Promise<void> {
  await post(controlUrl, '/complete-payment', { outTradeNo });
}

export async function completeRefund(controlUrl: string, outRefundNo: string): Promise<void> {
  await post(controlUrl, '/complete-refund', { outRefundNo });
}

async function post(controlUrl: string, path: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${controlUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`gateway control ${path} failed: ${response.status} ${text}`);
  }
  return text.length > 0 ? JSON.parse(text) : undefined;
}
