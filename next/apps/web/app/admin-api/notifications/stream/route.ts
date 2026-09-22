import { subscribeToAdmin } from '@shop/core/notification';
import { ADMIN_COOKIE, getContainer, readCookie } from '../../../../src/server';

/**
 * `/admin-api/notifications/stream` — the header bell's SSE feed.
 *
 * ## Why this is a bare route handler
 *
 * `handle()` validates a response against a zod schema and serialises it as
 * JSON. An SSE response is a `text/event-stream` body that never ends, so it
 * cannot be modelled by a `RouteDef` and cannot go through `handle` — the same
 * reason P0-b's hook uses a raw `EventSource` instead of `callRoute`. It is one
 * of exactly three bare handlers in this stream's scope, and it repeats only
 * the cookie lookup, not the authorisation rules.
 *
 * ## What it does not do
 *
 * It does **not** decide who may see what. The fan-out already resolved the
 * recipients against each event's permission atom (`findAdminRecipients`) and
 * published to those admins' channels only, so an operator without
 * `refund:request:read` has nothing on their channel to filter out. A filter
 * here would be a second place to get the same rule right.
 *
 * ## Keep-alive
 *
 * A comment line every 25 seconds. Without it a proxy with a 30 s idle timeout
 * closes the connection, the browser reconnects, and a shop behind nginx sees a
 * reconnect storm that looks exactly like an outage.
 */

const KEEPALIVE_MS = 25_000;

export async function GET(request: Request): Promise<Response> {
  const container = getContainer();

  const token = readCookie(request, ADMIN_COOKIE);
  if (!token) return unauthorised();
  const session = await container.adminAuth.resolve(token);
  if (!session) return unauthorised();

  const adminId = session.adminId;
  const encoder = new TextEncoder();

  let unsubscribe: (() => Promise<void>) | null = null;
  let keepalive: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // The client went away between the check and the enqueue.
          closed = true;
        }
      };

      // Tells the browser to wait 5 s before reconnecting, and gives the proxy
      // something to flush so the connection is established immediately.
      send(`retry: 5000\n\n`);

      try {
        unsubscribe = await subscribeToAdmin(container.redis, adminId, (payload) => {
          // The payload is already the JSON the bell parses; forwarding it
          // verbatim is what keeps the bell and the inbox showing one thing.
          send(`event: notification\ndata: ${payload}\n\n`);
        });
      } catch (error) {
        container.logger.error({ err: error, adminId }, 'notification stream subscribe failed');
        controller.close();
        return;
      }

      keepalive = setInterval(() => send(': keepalive\n\n'), KEEPALIVE_MS);

      request.signal.addEventListener('abort', () => {
        void cleanup(controller);
      });
    },

    async cancel() {
      await cleanup(null);
    },
  });

  async function cleanup(controller: ReadableStreamDefaultController<Uint8Array> | null) {
    if (closed) return;
    closed = true;
    if (keepalive) clearInterval(keepalive);
    if (unsubscribe) await unsubscribe().catch(() => undefined);
    try {
      controller?.close();
    } catch {
      // Already closed by the runtime; nothing to do.
    }
  }

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // nginx buffers `text/event-stream` by default, which holds every event
      // until the buffer fills — i.e. forever, for a bell that sends 200 bytes.
      'x-accel-buffering': 'no',
    },
  });
}

function unauthorised(): Response {
  return new Response(JSON.stringify({ code: 'UNAUTHENTICATED', message: '请先登录' }), {
    status: 401,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export const dynamic = 'force-dynamic';
