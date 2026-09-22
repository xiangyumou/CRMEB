import type { Ctx } from '../kernel/context';
import { DomainError } from '../kernel/errors';
import { getWechatClient, wechatConfig, type WechatCall } from '../wechat';
import type { WechatMenuButton } from './wechat-oa.repo';

/**
 * The Official Account management endpoints, on top of stream C's client.
 *
 * C owns the transport: the token cache, the cross-process single flight, the
 * `40001 → drop the token and retry once` rule and the TLS defaults. Everything
 * here goes through `client.call('oa', …)` so none of that is re-implemented,
 * and the one thing C's client cannot do — a multipart upload — is done below
 * with a token C issued.
 *
 * Every function raises `WECHAT_OA_API_FAILED` with WeChat's own `errcode` in
 * `details`. That number is the only thing that makes a failed menu publish
 * diagnosable; the legacy admin showed 操作失败 and dropped it.
 */

interface Envelope {
  errcode?: number;
  errmsg?: string;
}

/** Throws unless WeChat said `errcode: 0` (or said nothing, which also means yes). */
export function expectOk<T extends Envelope>(result: T, what: string): T {
  const errcode = result.errcode ?? 0;
  if (errcode !== 0) {
    throw new DomainError('WECHAT_OA_API_FAILED', {
      message: `${what}失败：${result.errmsg ?? ''} (${errcode})`.trim(),
      details: { errcode, errmsg: result.errmsg ?? '' },
    });
  }
  return result;
}

async function oaCall<T extends Envelope>(ctx: Ctx, req: WechatCall, what: string): Promise<T> {
  const result = await getWechatClient(ctx).call<T>('oa', req);
  return expectOk(result, what);
}

// ---------------------------------------------------------------------------
// menu
// ---------------------------------------------------------------------------

export async function publishMenu(ctx: Ctx, buttons: WechatMenuButton[]): Promise<void> {
  await oaCall(
    ctx,
    { method: 'POST', path: '/cgi-bin/menu/create', body: { button: buttons } },
    '发布菜单',
  );
}

export async function deleteRemoteMenu(ctx: Ctx): Promise<void> {
  await oaCall(ctx, { method: 'GET', path: '/cgi-bin/menu/delete' }, '删除菜单');
}

// ---------------------------------------------------------------------------
// QR codes
// ---------------------------------------------------------------------------

export interface RemoteQrcode {
  ticket: string;
  /** Seconds; `0` for a permanent code. */
  expireSeconds: number;
  url: string;
}

/**
 * Asks WeChat for a channel QR code.
 *
 * The scene is always sent as a **string** (`QR_LIMIT_STR_SCENE` /
 * `QR_STR_SCENE`). WeChat's numeric scene ids are capped at 100 000 permanent
 * codes and force the shop to keep a counter; a string scene is what the
 * `wechat_qrcodes.scene` column already is.
 */
export async function createQrcode(
  ctx: Ctx,
  args: { scene: string; expireSeconds: number },
): Promise<RemoteQrcode> {
  const permanent = args.expireSeconds <= 0;
  const result = await oaCall<
    Envelope & { ticket?: string; expire_seconds?: number; url?: string }
  >(
    ctx,
    {
      method: 'POST',
      path: '/cgi-bin/qrcode/create',
      body: {
        ...(permanent ? {} : { expire_seconds: args.expireSeconds }),
        action_name: permanent ? 'QR_LIMIT_STR_SCENE' : 'QR_STR_SCENE',
        action_info: { scene: { scene_str: args.scene } },
      },
    },
    '生成渠道二维码',
  );
  if (!result.ticket) {
    throw new DomainError('WECHAT_OA_API_FAILED', {
      message: '微信没有返回二维码 ticket',
      details: { errcode: 0, errmsg: 'missing ticket' },
    });
  }
  return {
    ticket: result.ticket,
    expireSeconds: result.expire_seconds ?? 0,
    url: result.url ?? '',
  };
}

/** The scannable image for a ticket. Public, no token — WeChat serves it to anyone. */
export function qrcodeImageUrl(ticket: string): string {
  return `https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=${encodeURIComponent(ticket)}`;
}

// ---------------------------------------------------------------------------
// media
// ---------------------------------------------------------------------------

export interface UploadedMedium {
  mediaId: string;
  url: string | null;
}

/**
 * Uploads bytes we already hold to WeChat.
 *
 * C's `WechatCoreClient` speaks JSON only, and WeChat's material endpoints are
 * multipart — so this builds the request itself, with a token `client.accessToken`
 * issued. It is the one place in this domain that calls `fetch`, and it is a
 * local adapter: **CR-4-e2** asks stream C for an `upload()` method so the retry
 * and invalidate rules apply here too. Until then a stale token here surfaces as
 * `WECHAT_OA_API_FAILED 40001` and the operator presses the button again.
 */
export async function uploadMedium(
  ctx: Ctx,
  args: {
    kind: 'image' | 'voice' | 'video' | 'thumb';
    bytes: Uint8Array;
    filename: string;
    contentType: string;
    isPermanent: boolean;
  },
): Promise<UploadedMedium> {
  const client = getWechatClient(ctx);
  const [token, config] = await Promise.all([
    client.accessToken('oa'),
    ctx.config.get(wechatConfig),
  ]);

  const path = args.isPermanent ? '/cgi-bin/material/add_material' : '/cgi-bin/media/upload';
  const url = new URL(path, config.apiBaseUrl);
  url.searchParams.set('access_token', token);
  url.searchParams.set('type', args.kind);

  // A copy into a plain `ArrayBuffer`: `Uint8Array` may be backed by a
  // `SharedArrayBuffer`, which `Blob` does not accept, and the apps compile with
  // the DOM lib where that distinction is a type error rather than a surprise.
  const buffer = new ArrayBuffer(args.bytes.byteLength);
  new Uint8Array(buffer).set(args.bytes);

  const form = new FormData();
  form.append('media', new Blob([buffer], { type: args.contentType }), args.filename);

  const response = await fetch(url, { method: 'POST', body: form });
  const text = await response.text();
  let parsed: Envelope & { media_id?: string; url?: string; thumb_media_id?: string };
  try {
    parsed = text.length > 0 ? JSON.parse(text) : {};
  } catch {
    throw new DomainError('WECHAT_OA_API_FAILED', {
      message: '微信素材接口返回了非 JSON 响应',
      details: { errcode: -1, errmsg: text.slice(0, 200) },
    });
  }
  expectOk(parsed, '上传素材');

  const mediaId = parsed.media_id ?? parsed.thumb_media_id;
  if (!mediaId) {
    throw new DomainError('WECHAT_OA_API_FAILED', {
      message: '微信没有返回素材 ID',
      details: { errcode: 0, errmsg: 'missing media_id' },
    });
  }
  return { mediaId, url: parsed.url ?? null };
}

export async function deleteRemoteMedium(ctx: Ctx, mediaId: string): Promise<void> {
  await oaCall(
    ctx,
    { method: 'POST', path: '/cgi-bin/material/del_material', body: { media_id: mediaId } },
    '删除素材',
  );
}

export interface RemoteMaterial {
  mediaId: string;
  url: string | null;
  updateTime: number | null;
}

/** One page of permanent material of one kind. WeChat caps `count` at 20. */
export async function listRemoteMaterial(
  ctx: Ctx,
  args: { kind: 'image' | 'voice' | 'video' | 'news'; offset: number; count: number },
): Promise<{ items: RemoteMaterial[]; total: number }> {
  const result = await oaCall<
    Envelope & {
      total_count?: number;
      item?: { media_id?: string; url?: string; update_time?: number }[];
    }
  >(
    ctx,
    {
      method: 'POST',
      path: '/cgi-bin/material/batchget_material',
      body: { type: args.kind, offset: args.offset, count: Math.min(args.count, 20) },
    },
    '读取素材列表',
  );
  return {
    items: (result.item ?? [])
      .filter((item): item is { media_id: string; url?: string; update_time?: number } =>
        Boolean(item.media_id),
      )
      .map((item) => ({
        mediaId: item.media_id,
        url: item.url ?? null,
        updateTime: item.update_time ?? null,
      })),
    total: result.total_count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// jsapi ticket
// ---------------------------------------------------------------------------

const TICKET_TTL_MARGIN_SECONDS = 300;

/**
 * The JS-SDK ticket, cached in Redis the way the access token is.
 *
 * WeChat rate-limits the ticket endpoint hard, and every page view of an H5
 * storefront asks for a signature. Without the cache a busy morning exhausts
 * the quota and every page loses `wx.chooseWXPay` — which is the payment
 * button.
 *
 * The single flight here is only the Redis key: two processes refreshing at
 * once each get a valid ticket (unlike the access token, issuing a ticket does
 * not invalidate the last one), so a lock would buy nothing but a stall.
 */
export async function jsapiTicket(ctx: Ctx, appId: string): Promise<string> {
  const key = `wechat:jsapi-ticket:${appId}`;
  const cached = await ctx.redis.get(key);
  if (cached) return cached;

  const result = await oaCall<Envelope & { ticket?: string; expires_in?: number }>(
    ctx,
    { method: 'GET', path: '/cgi-bin/ticket/getticket', query: { type: 'jsapi' } },
    '获取 JS-SDK ticket',
  );
  if (!result.ticket) {
    throw new DomainError('WECHAT_OA_API_FAILED', {
      message: '微信没有返回 jsapi_ticket',
      details: { errcode: 0, errmsg: 'missing ticket' },
    });
  }
  const ttl = Math.max(60, (result.expires_in ?? 7200) - TICKET_TTL_MARGIN_SECONDS);
  await ctx.redis.set(key, result.ticket, 'EX', ttl);
  return result.ticket;
}
