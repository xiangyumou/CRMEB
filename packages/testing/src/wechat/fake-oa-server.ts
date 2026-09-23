import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A fake `api.weixin.qq.com` — the Official Account management endpoints, and
 * the mini-program ones that share the same transport.
 *
 * `fake-gateway.ts` next door speaks WeChat **Pay** v3: a different host, a
 * different auth scheme and a different body format. This one speaks the
 * `cgi-bin` / `sns` / `wxa` endpoints the shop calls — the access token,
 * `menu/create`, `menu/delete`, `qrcode/create`, `ticket/getticket`,
 * `media/upload`, the material store, `sns/jscode2session`,
 * `wxa/business/getuserphonenumber` and `wxa/getwxacodeunlimit`. Nothing in the
 * test suite may reach the real WeChat, and the client's retry rules
 * (`40001 → drop the token and try once more`) only mean anything against a
 * server that can actually refuse.
 *
 * It lives in `@shop/testing` rather than in a domain because three surfaces
 * need it (OA management, storefront sign-in, mini-program codes), and a test
 * helper imported across a domain boundary is exactly what the conventions
 * forbid.
 *
 * ## Two credential pairs, one process
 *
 * `cgi-bin/token` accepts either the OA pair or the mini pair and remembers
 * which app each token belongs to, so presenting an OA token to a `wxa/*`
 * endpoint is refused the way WeChat refuses it. "The mini-program credentials
 * were never filled in and the OA's were used instead" is a real
 * misconfiguration; a fake that shrugged at it would hide it.
 *
 * ## Codes are seeded, never guessed
 *
 * `setMiniCode()` and `setPhoneCode()` say what a `wx.login()` / `getPhoneNumber`
 * code redeems to. An unseeded code is `40029 invalid code`, which is what a
 * spent or forged one really looks like — so the refusal path is the default
 * rather than a special mode a test has to remember to ask for.
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
  /**
   * While set, `wxa/getwxacodeunlimit` answers this JSON body instead of the
   * PNG. WeChat really does answer 200 `application/json` on failure and 200
   * `image/*` on success, which is why the caller has to look at the bytes.
   */
  failWxaCode: { errcode: number; errmsg: string } | null;
}

/** What a seeded `wx.login()` code redeems to. */
export interface FakeMiniSession {
  openid: string;
  unionid?: string;
  sessionKey?: string;
}

/** What a seeded `getPhoneNumber` code redeems to. */
export interface FakePhoneNumber {
  /** Without the country code — `purePhoneNumber`, which is what the shop stores. */
  phone: string;
  countryCode?: string;
}

export interface FakeOaServer {
  url: string;
  appId: string;
  appSecret: string;
  /** The mini-program pair. `cgi-bin/token` accepts it too. */
  miniAppId: string;
  miniAppSecret: string;
  calls: FakeOaCall[];
  /** Permanent material, keyed by media id — what `batchget_material` reports. */
  material: Map<string, FakeOaMaterial>;
  /** Scene strings `qrcode/create` has issued, in order. */
  scenes: string[];
  /** `{ page, scene }` of every `wxa/getwxacodeunlimit` that produced a PNG, in order. */
  miniCodes: Array<{ page: string; scene: string }>;
  behaviour: FakeOaBehaviour;
  /** Access tokens handed out, newest last. */
  tokens: string[];
  /** The last live menu tree `menu/create` accepted, or `null`. */
  publishedMenu: unknown;
  addMaterial(material: Omit<FakeOaMaterial, 'updateTime'> & { updateTime?: number }): void;
  /** Teach `sns/jscode2session` one code. Anything else is `40029`. */
  setMiniCode(code: string, session: FakeMiniSession): void;
  /** Teach `wxa/business/getuserphonenumber` one code. Anything else is `40029`. */
  setPhoneCode(code: string, phone: FakePhoneNumber): void;
  callsTo(path: string): FakeOaCall[];
  reset(): void;
  close(): Promise<void>;
  server: Server;
}

const APP_ID = 'wxfakeoa0000000001';
const APP_SECRET = 'fake-oa-app-secret-0000000000001';
const MINI_APP_ID = 'wxfakemini000000001';
const MINI_APP_SECRET = 'fake-mini-app-secret-000000001';

/**
 * A real 1×1 PNG, so a caller that sniffs the magic bytes before storing them
 * (the storage domain does) sees a picture rather than a rejection.
 */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/** WeChat's own cap on the `scene` string. */
const SCENE_MAX_BYTES = 32;

export async function startFakeOaServer(options: { port?: number } = {}): Promise<FakeOaServer> {
  const calls: FakeOaCall[] = [];
  const material = new Map<string, FakeOaMaterial>();
  const scenes: string[] = [];
  const miniCodes: Array<{ page: string; scene: string }> = [];
  const tokens: string[] = [];
  /** token → which app asked for it, so a `wxa/*` call can be checked. */
  const tokenApp = new Map<string, 'oa' | 'mini'>();
  const miniSessions = new Map<string, FakeMiniSession>();
  const phoneCodes = new Map<string, FakePhoneNumber>();
  const behaviour: FakeOaBehaviour = {
    failNext: null,
    failMenu: null,
    ticketExpiresIn: 7200,
    dropNext: false,
    failWxaCode: null,
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

  /** WeChat answers a successful `getwxacodeunlimit` with image bytes, status 200. */
  function png(res: ServerResponse): void {
    res.writeHead(200, { 'content-type': 'image/png', 'content-length': String(PNG_1X1.length) });
    res.end(PNG_1X1);
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
      const app =
        query['appid'] === APP_ID && query['secret'] === APP_SECRET
          ? 'oa'
          : query['appid'] === MINI_APP_ID && query['secret'] === MINI_APP_SECRET
            ? 'mini'
            : null;
      if (app === null) {
        json(res, { errcode: 40013, errmsg: 'invalid appid' });
        return;
      }
      issued += 1;
      const token = `FAKE_TOKEN_${issued}`;
      tokens.push(token);
      tokenApp.set(token, app);
      json(res, { access_token: token, expires_in: 7200 });
      return;
    }

    /**
     * `wx.login()`'s code. No access token: the appid/secret pair *is* the
     * credential, which is why this endpoint sits above the token gate.
     */
    if (url.pathname === '/sns/jscode2session') {
      if (query['appid'] !== MINI_APP_ID || query['secret'] !== MINI_APP_SECRET) {
        json(res, { errcode: 40013, errmsg: 'invalid appid' });
        return;
      }
      const session = miniSessions.get(query['js_code'] ?? '');
      if (!session) {
        json(res, { errcode: 40029, errmsg: 'invalid code' });
        return;
      }
      json(res, {
        openid: session.openid,
        ...(session.unionid === undefined ? {} : { unionid: session.unionid }),
        session_key: session.sessionKey ?? 'FAKE_SESSION_KEY',
      });
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
    const app = tokenApp.get(query['access_token'] ?? '') ?? 'oa';

    // The mini-program endpoints. A token minted from the OA's credentials is
    // refused here exactly as WeChat refuses it: the two apps are two apps.
    if (url.pathname.startsWith('/wxa/')) {
      if (app !== 'mini') {
        json(res, { errcode: 40013, errmsg: 'invalid appid' });
        return;
      }
      switch (url.pathname) {
        case '/wxa/business/getuserphonenumber': {
          const found = phoneCodes.get(String(body['code'] ?? ''));
          if (!found) {
            json(res, { errcode: 40029, errmsg: 'invalid code' });
            return;
          }
          json(res, {
            errcode: 0,
            errmsg: 'ok',
            phone_info: {
              phoneNumber: `+${found.countryCode ?? '86'}${found.phone}`,
              purePhoneNumber: found.phone,
              countryCode: found.countryCode ?? '86',
            },
          });
          return;
        }
        case '/wxa/getwxacodeunlimit': {
          if (behaviour.failWxaCode) {
            json(res, behaviour.failWxaCode);
            return;
          }
          const scene = String(body['scene'] ?? '');
          if (scene === '' || Buffer.byteLength(scene, 'utf8') > SCENE_MAX_BYTES) {
            json(res, { errcode: 40097, errmsg: 'invalid args' });
            return;
          }
          miniCodes.push({ page: String(body['page'] ?? ''), scene });
          png(res);
          return;
        }
        default:
          json(res, { errcode: 48001, errmsg: `fake oa: ${url.pathname} 未实现` });
          return;
      }
    }

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
    miniAppId: MINI_APP_ID,
    miniAppSecret: MINI_APP_SECRET,
    calls,
    material,
    scenes,
    miniCodes,
    behaviour,
    tokens,
    server,
    get publishedMenu() {
      return publishedMenu;
    },
    addMaterial(item) {
      material.set(item.mediaId, { updateTime: 1_767_668_400, ...item });
    },
    setMiniCode(code, session) {
      miniSessions.set(code, session);
    },
    setPhoneCode(code, phone) {
      phoneCodes.set(code, phone);
    },
    callsTo(path) {
      return calls.filter((call) => call.path === path);
    },
    reset() {
      calls.length = 0;
      material.clear();
      scenes.length = 0;
      miniCodes.length = 0;
      miniSessions.clear();
      phoneCodes.clear();
      publishedMenu = null;
      behaviour.failNext = null;
      behaviour.failMenu = null;
      behaviour.ticketExpiresIn = 7200;
      behaviour.dropNext = false;
      behaviour.failWxaCode = null;
    },
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
