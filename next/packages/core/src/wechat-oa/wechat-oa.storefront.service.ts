import type {
  JssdkConfig,
  JssdkConfigQuery,
  SubscribeTemplates,
  SubscribeTemplatesQuery,
} from '@shop/contracts/wechat-oa/schemas';
import { createHash, randomBytes } from 'node:crypto';
import type { Ctx } from '../kernel/context';
import { DomainError } from '../kernel/errors';
import { publicOrigin } from '../system';
import { wechatOaRuntimeConfig } from './wechat-oa.config';
import { jsapiTicket } from './wechat-oa.client';
import { requireOaCredentials } from './wechat-oa.credentials';

/**
 * The two things the H5 and mini-program clients ask the server for.
 *
 * Neither needs a login: a shop's JS-SDK signature and its subscribe-template
 * ids are public configuration, and requiring a session would break the share
 * card on a page a customer opened from a friend.
 */

// ---------------------------------------------------------------------------
// JS-SDK
// ---------------------------------------------------------------------------

/**
 * Signs one page URL for `wx.config`.
 *
 * ## The check that the legacy endpoint did not have
 *
 * `jsapi_ticket` is the account's, and a signature over an arbitrary URL is a
 * signature for somebody else's page: hand it out freely and any site can call
 * `wx.chooseWXPay` and `wx.getLocation` in our name, with our brand on the
 * permission sheet. The legacy `WechatServices::jsSdk` signed whatever it was
 * given. Here the URL's host must be the site's own or one an operator listed
 * in `wechat-oa-runtime.jsApiAllowedHosts`.
 *
 * ## The signature itself
 *
 * `sha1` over the four fields sorted by key, joined as `k=v&k=v`, with the URL
 * exactly as the browser reports it (`location.href.split('#')[0]`). Any
 * difference — a trailing slash, an added parameter, the fragment — produces
 * `invalid signature` in the browser and nothing at all on the server, which is
 * why the URL is taken from the client rather than reconstructed here.
 */
export async function jssdkConfigFor(ctx: Ctx, query: JssdkConfigQuery): Promise<JssdkConfig> {
  const credentials = await requireOaCredentials(ctx);
  const [runtime, origin] = await Promise.all([
    ctx.config.get(wechatOaRuntimeConfig),
    // The deployment's own origin, from `site` (CR-1-e2). It used to come from
    // 通知设置, which meant this endpoint imported the notification domain to
    // ask a question that has nothing to do with notifications.
    publicOrigin(ctx),
  ]);

  const url = query.url.split('#')[0] ?? '';
  assertAllowed(url, origin, runtime.jsApiAllowedHosts);

  const ticket = await jsapiTicket(ctx, credentials.appId);
  const nonceStr = randomBytes(8).toString('hex');
  const timestamp = String(Math.floor(ctx.clock.now().getTime() / 1000));

  return {
    appId: credentials.appId,
    timestamp,
    nonceStr,
    signature: jsapiSignature({ ticket, nonceStr, timestamp, url }),
  };
}

/** `sha1(jsapi_ticket=…&noncestr=…&timestamp=…&url=…)` — the keys are lower-case and sorted. */
export function jsapiSignature(args: {
  ticket: string;
  nonceStr: string;
  timestamp: string;
  url: string;
}): string {
  const message = [
    `jsapi_ticket=${args.ticket}`,
    `noncestr=${args.nonceStr}`,
    `timestamp=${args.timestamp}`,
    `url=${args.url}`,
  ].join('&');
  return createHash('sha1').update(message, 'utf8').digest('hex');
}

/**
 * Host allow-list.
 *
 * The site's own origin is always allowed — a shop that has configured nothing
 * still has to be able to sign its own pages. Everything else must be listed,
 * and the comparison is on the **host**, not on a prefix: `shop.example.com`
 * must not match `shop.example.com.attacker.test`.
 */
export function assertAllowed(url: string, siteOrigin: string, allowedHosts: string): void {
  let host: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new DomainError('WECHAT_OA_URL_NOT_ALLOWED');
    }
    host = parsed.host.toLowerCase();
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError('WECHAT_OA_URL_NOT_ALLOWED', { message: '待签名的地址不是合法的 URL' });
  }

  const allowed = new Set<string>();
  if (siteOrigin.trim() !== '') {
    try {
      allowed.add(new URL(siteOrigin).host.toLowerCase());
    } catch {
      // A misconfigured base URL must not become "allow everything".
    }
  }
  for (const entry of allowedHosts.split(',')) {
    const trimmed = entry.trim().toLowerCase();
    if (trimmed === '') continue;
    // Accept both `example.com` and `https://example.com` — operators paste both.
    allowed.add(trimmed.includes('://') ? safeHost(trimmed) : trimmed);
  }
  allowed.delete('');

  if (!allowed.has(host)) {
    throw new DomainError('WECHAT_OA_URL_NOT_ALLOWED', { details: { host } });
  }
}

function safeHost(value: string): string {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// subscribe templates
// ---------------------------------------------------------------------------

/**
 * Which template ids the client should ask permission for at this moment.
 *
 * `wx.requestSubscribeMessage` must be called from a user gesture and takes the
 * ids up front, so the client cannot discover them from the notification
 * templates the way the sender does. The scenes are ours; an unconfigured scene
 * answers with an empty list and the client skips the prompt rather than
 * showing an empty permission sheet.
 */
export async function subscribeTemplatesFor(
  ctx: Ctx,
  query: SubscribeTemplatesQuery,
): Promise<SubscribeTemplates> {
  const runtime = await ctx.config.get(wechatOaRuntimeConfig);
  const raw =
    query.scene === 'order-create'
      ? runtime.subscribeOrderCreate
      : query.scene === 'order-pay'
        ? runtime.subscribeOrderPay
        : query.scene === 'order-ship'
          ? runtime.subscribeOrderShip
          : runtime.subscribeRefund;

  return {
    templateIds: [
      ...new Set(
        raw
          .split(',')
          .map((id) => id.trim())
          .filter((id) => id !== ''),
      ),
    ],
  };
}
