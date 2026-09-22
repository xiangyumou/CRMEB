import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A fake `api.weixin.qq.com` for the Official Account management endpoints.
 *
 * Stream C's fake gateway in `@shop/testing` speaks WeChat **Pay** v3, which is
 * a different API with a different auth scheme; this speaks the `cgi-bin`
 * endpoints this domain uses — the access token, `menu/create`,
 * `qrcode/create`, `ticket/getticket`, `media/upload` and the material store.
 * Nothing in the test suite may reach the real WeChat, and the client's retry
 * rules (`40001 → drop the token and try once more`) only mean anything against
 * a server that can actually refuse.
 *
 * It lives in `src/` rather than in a test file because three integration files
 * share it and a helper that is itself a test file would run its neighbours'
 * tests again on import. **CR-2-e3** asks for it to move next to C's gateway in
 * `@shop/testing/wechat`; until then nothing but `*.int.test.ts` imports it.
 */

export interface FakeOaCall {
  method: string;
  path: string;
  query: Record<string, string>;
  body: unknown;
  /** The `access_token` the app sent, so a test can prove it used a fresh one. */
  accessToken: string | null;
}

export interface FakeOaMaterial {
  mediaId: string;
  kind: 'image' | 'voice' | 'video' | 'news';
  url: string | null;
  updateTime: number;
}

export interface FakeOaBehaviour {
  /** One-shot `{errcode, errmsg}` consumed by the next `cgi-bin` call. */
  failNext: { errcode: number; errmsg: string } | null;
  /** Every `menu/create` is refused with this until it is cleared. */
  failMenu: { errcode: number; errmsg: string } | null;
  /** How many seconds `ticket/getticket` claims its ticket is good for. */
  ticketExpiresIn: number;
  /** One-shot socket destruction: the app sees a transport failure. */
  dropNext: boolean;
}

export interface FakeOaServer {
  url: string;
  appId: string;
  appSecret: string;
  calls: FakeOaCall[];
  /** Permanent material, keyed by media id — what `batchget_material` reports. */
  material: Map<string, FakeOaMaterial>;
  /** Scene strings `qrcode/create` has issued, in order. */
  scenes: string[];
  behaviour: FakeOaBehaviour;
  /** Access tokens handed out, newest last. */
  tokens: string[];
  /** The last live menu tree `menu/create` accepted, or `null`. */
  publishedMenu: unknown;
  addMaterial(material: Omit<FakeOaMaterial, 'updateTime'> & { updateTime?: number }): void;
  callsTo(path: string): FakeOaCall[];
  reset(): void;
  close(): Promise<void>;
  server: Server;
}

const APP_ID = 'wxfakeoa0000000001';
const APP_SECRET = 'fake-oa-app-secret-0000000000001';

export async function startFakeOaServer(options: { port?: number } = {}): Promise<FakeOaServer> {
  const calls: FakeOaCall[] = [];
  const material = new Map<string, FakeOaMaterial>();
  const scenes: string[] = [];
  const tokens: string[] = [];
  const behaviour: FakeOaBehaviour = {
    failNext: null,
    failMenu: null,
    ticketExpiresIn: 7200,
    dropNext: false,
  };
  let publishedMenu: unknown = null;
  let issued = 0;
  let mediaSequence = 0;

  const server = createServer((req, res) => {
    void route(req, res);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, '127.0.0.1', resolve);
  });
  const port = (server.address() as AddressInfo).port;

  async function readBody(req: IncomingMessage): Promise<{ raw: string; parsed: unknown }> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString('utf8');
    try {
      return { raw, parsed: raw.length > 0 ? JSON.parse(raw) : undefined };
    } catch {
      // A multipart upload is not JSON, and the shape of the bytes is not what
      // any of these tests are about — the handle WeChat answers with is.
      return { raw, parsed: undefined };
    }
  }

  function json(res: ServerResponse, body: unknown): void {
    const payload = JSON.stringify(body);
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(payload);
  }

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const { raw, parsed } = await readBody(req);
    const url = new URL(req.url ?? '/', 'http://oa.local');
    const query = Object.fromEntries(url.searchParams);
    calls.push({
      method: (req.method ?? 'GET').toUpperCase(),
      path: url.pathname,
      query,
      body: parsed ?? raw,
      accessToken: query['access_token'] ?? null,
    });

    if (behaviour.dropNext) {
      behaviour.dropNext = false;
      req.destroy();
      res.destroy();
      return;
    }

    if (url.pathname === '/cgi-bin/token') {
      if (query['appid'] !== APP_ID || query['secret'] !== APP_SECRET) {
        json(res, { errcode: 40013, errmsg: 'invalid appid' });
        return;
      }
      issued += 1;
      const token = `FAKE_TOKEN_${issued}`;
      tokens.push(token);
      json(res, { access_token: token, expires_in: 7200 });
      return;
    }

    const canned = behaviour.failNext;
    if (canned) {
      behaviour.failNext = null;
      json(res, canned);
      return;
    }

    // Every endpoint below needs a token WeChat issued; the client is the only
    // thing that knows how to get one, so an absent one is a real failure.
    if (query['access_token'] === undefined || !tokens.includes(query['access_token'])) {
      json(res, { errcode: 40001, errmsg: 'invalid credential' });
      return;
    }

    const body = (parsed ?? {}) as Record<string, unknown>;

    switch (url.pathname) {
      case '/cgi-bin/menu/create': {
        if (behaviour.failMenu) {
          json(res, behaviour.failMenu);
          return;
        }
        publishedMenu = body['button'] ?? null;
        json(res, { errcode: 0, errmsg: 'ok' });
        return;
      }
      case '/cgi-bin/menu/delete': {
        publishedMenu = null;
        json(res, { errcode: 0, errmsg: 'ok' });
        return;
      }
      case '/cgi-bin/qrcode/create': {
        const info = body['action_info'] as { scene?: { scene_str?: string } } | undefined;
        const scene = info?.scene?.scene_str ?? '';
        scenes.push(scene);
        json(res, {
          ticket: `TICKET_${scene}`,
          expire_seconds: Number(body['expire_seconds'] ?? 0),
          url: `https://weixin.qq.com/q/${scene}`,
        });
        return;
      }
      case '/cgi-bin/ticket/getticket': {
        json(res, {
          errcode: 0,
          errmsg: 'ok',
          ticket: `JSAPI_TICKET_${issued}`,
          expires_in: behaviour.ticketExpiresIn,
        });
        return;
      }
      case '/cgi-bin/media/upload':
      case '/cgi-bin/material/add_material': {
        mediaSequence += 1;
        const permanent = url.pathname.endsWith('add_material');
        const mediaId = `${permanent ? 'PERM' : 'TEMP'}_MEDIA_${mediaSequence}`;
        const kind = (query['type'] ?? 'image') as FakeOaMaterial['kind'];
        const mediaUrl = permanent ? `https://mmbiz.qpic.cn/${mediaId}` : null;
        if (permanent) {
          material.set(mediaId, { mediaId, kind, url: mediaUrl, updateTime: 1_767_668_400 });
        }
        json(res, { media_id: mediaId, ...(mediaUrl === null ? {} : { url: mediaUrl }) });
        return;
      }
      case '/cgi-bin/material/del_material': {
        const mediaId = String(body['media_id'] ?? '');
        if (!material.delete(mediaId)) {
          // WeChat's own answer for a handle it has already forgotten, which the
          // service treats as a correction rather than a failure.
          json(res, { errcode: 40007, errmsg: 'invalid media_id' });
          return;
        }
        json(res, { errcode: 0, errmsg: 'ok' });
        return;
      }
      case '/cgi-bin/material/batchget_material': {
        const kind = String(body['type'] ?? 'image');
        const offset = Number(body['offset'] ?? 0);
        const count = Number(body['count'] ?? 20);
        const all = [...material.values()].filter((item) => item.kind === kind);
        json(res, {
          total_count: all.length,
          item_count: Math.min(count, Math.max(all.length - offset, 0)),
          item: all.slice(offset, offset + count).map((item) => ({
            media_id: item.mediaId,
            url: item.url ?? '',
            update_time: item.updateTime,
          })),
        });
        return;
      }
      default:
        json(res, { errcode: 48001, errmsg: `fake oa: ${url.pathname} 未实现` });
    }
  }

  return {
    url: `http://127.0.0.1:${port}`,
    appId: APP_ID,
    appSecret: APP_SECRET,
    calls,
    material,
    scenes,
    behaviour,
    tokens,
    server,
    get publishedMenu() {
      return publishedMenu;
    },
    addMaterial(item) {
      material.set(item.mediaId, { updateTime: 1_767_668_400, ...item });
    },
    callsTo(path) {
      return calls.filter((call) => call.path === path);
    },
    reset() {
      calls.length = 0;
      material.clear();
      scenes.length = 0;
      publishedMenu = null;
      behaviour.failNext = null;
      behaviour.failMenu = null;
      behaviour.ticketExpiresIn = 7200;
      behaviour.dropNext = false;
    },
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
