import type { NotificationChannel } from '@shop/contracts/notification/schemas';
import { toMiniPath } from '@shop/contracts/system/storefront-routes';
import type { Ctx } from '../kernel/context';
import { publicOrigin } from '../system';
import { findOpenid, getWechatClient } from '../wechat';
import { notificationConfig } from './notification.config';
import { resolveSmsPort } from './notification.ports';
import type { NotificationChannels } from './notification.repo';
import type { NotificationEvent } from './notification.registry';
import { render, renderFields, renderRoute, toTemplateData } from './notification.render';

/**
 * The outbound half of a fan-out: one function per channel, each returning an
 * outcome instead of throwing.
 *
 * Three rules hold for all of them, and they are the whole reason this file is
 * separate from the service:
 *
 * 1. **A channel never throws.** It returns `sent`, `skipped` or `failed`. The
 *    caller decides what a failure means for the effect as a whole; a throw
 *    here would abort the channels that come after it, so one missing openid
 *    would also lose the SMS.
 * 2. **`skipped` is not `failed`.** No openid, no phone, no provider, template
 *    not configured — none of these is a fault to retry, and treating them as
 *    failures would park an effect row per order for an operator who cannot do
 *    anything about it. Only a *transport* failure or a WeChat error code that
 *    can plausibly clear is `failed`.
 * 3. **Nothing here writes to the database.** The in-app channel is the
 *    exception and it lives in the service, inside the transaction that also
 *    publishes to the bell.
 */

export type ChannelOutcome =
  | { kind: 'sent'; detail?: string }
  | { kind: 'skipped'; reason: string }
  | { kind: 'failed'; reason: string };

export interface SendContext {
  event: NotificationEvent;
  channels: NotificationChannels;
  /** The recipient. `null` for admin-audience events, which have no WeChat identity. */
  userId: number | null;
  /** Flattened event payload, ready for `{{…}}` substitution. */
  data: Record<string, string>;
}

/**
 * Turns the event's `link` into something a WeChat message can open.
 *
 * A relative path is joined onto `site.publicOrigin`; an absolute URL is left
 * alone. With no origin configured the link is dropped rather than sent as a
 * bare path, because WeChat renders an unopenable link as a dead blue word and
 * the customer taps it anyway.
 */
export function absoluteLink(baseUrl: string, link: string | undefined): string | undefined {
  if (link === undefined || link === '') return undefined;
  if (/^https?:\/\//i.test(link)) return link;
  const base = baseUrl.replace(/\/+$/, '');
  if (base === '') return undefined;
  return `${base}${link.startsWith('/') ? '' : '/'}${link}`;
}

// ---------------------------------------------------------------------------
// OA template message
// ---------------------------------------------------------------------------

export async function sendWechatOa(ctx: Ctx, input: SendContext): Promise<ChannelOutcome> {
  const config = input.channels.wechatOa;
  if (!config?.enabled) return { kind: 'skipped', reason: 'channel disabled' };
  const templateId = config.templateId ?? '';
  if (templateId === '') return { kind: 'skipped', reason: 'no template id' };
  if (input.userId === null) return { kind: 'skipped', reason: 'no user' };

  const openid = await findOpenid(ctx.db, input.userId, 'oa');
  if (openid === null) return { kind: 'skipped', reason: 'user has no oa openid' };

  const url = absoluteLink(
    await publicOrigin(ctx),
    render(config.linkUrl ?? input.event.link ?? '', input.data),
  );

  const fields = renderFields(config.fields, input.data);
  if (Object.keys(fields).length === 0) {
    // WeChat refuses a template message with an empty `data` object
    // (`errcode 40003`-adjacent), and there is genuinely nothing to say.
    return { kind: 'skipped', reason: 'no rendered fields' };
  }

  const result = await getWechatClient(ctx).sendTemplateMessage({
    touser: openid,
    templateId,
    ...(url === undefined ? {} : { url }),
    data: fields,
  });
  return classify(result, 'wechatOa');
}

// ---------------------------------------------------------------------------
// mini-program subscribe message
// ---------------------------------------------------------------------------

export async function sendWechatMini(ctx: Ctx, input: SendContext): Promise<ChannelOutcome> {
  const config = input.channels.wechatMini;
  if (!config?.enabled) return { kind: 'skipped', reason: 'channel disabled' };
  const templateId = config.templateId ?? '';
  if (templateId === '') return { kind: 'skipped', reason: 'no template id' };
  if (input.userId === null) return { kind: 'skipped', reason: 'no user' };

  const openid = await findOpenid(ctx.db, input.userId, 'mini');
  if (openid === null) return { kind: 'skipped', reason: 'user has no mini openid' };

  const { miniProgramState } = await ctx.config.get(notificationConfig);
  const fields = renderFields(config.fields, input.data);
  if (Object.keys(fields).length === 0) return { kind: 'skipped', reason: 'no rendered fields' };

  const page = subscribePage(input);
  const result = await getWechatClient(ctx).sendSubscribeMessage({
    touser: openid,
    templateId,
    ...(page === '' ? {} : { page }),
    miniprogramState: miniProgramState,
    data: fields,
  });
  return classify(result, 'wechatMini');
}

/**
 * The subscribe message's `page`: the event's catalogue route through
 * `toMiniPath` (docs/mini/pages.md §3.4). An event without a route, or a route
 * that does not render (a missing variable), sends the message without a page
 * — WeChat then opens the home page — rather than guessing.
 */
function subscribePage(input: SendContext): string {
  if (!input.event.route) return '';
  const route = renderRoute(input.event.route, input.data);
  return route ? toMiniPath(route) : '';
}

// ---------------------------------------------------------------------------
// SMS
// ---------------------------------------------------------------------------

export async function sendSms(ctx: Ctx, input: SendContext): Promise<ChannelOutcome> {
  const config = input.channels.sms;
  if (!config?.enabled) return { kind: 'skipped', reason: 'channel disabled' };
  if (config.templateCode === '') return { kind: 'skipped', reason: 'no template code' };
  if (input.userId === null) return { kind: 'skipped', reason: 'no user' };

  const port = resolveSmsPort();
  if (!port) return { kind: 'skipped', reason: 'no sms provider registered' };

  const result = await port.send(ctx, {
    userId: input.userId,
    templateCode: config.templateCode,
    ...(config.signName === undefined ? {} : { signName: config.signName }),
    params: Object.fromEntries(
      Object.entries(input.data).map(([key, value]) => [key, String(value)]),
    ),
    notificationCode: input.event.code,
  });
  if (result.ok) return { kind: 'sent' };
  return {
    kind: 'failed',
    reason: `sms ${result.errorCode ?? ''} ${result.errorMessage ?? ''}`.trim(),
  };
}

// ---------------------------------------------------------------------------
// shared
// ---------------------------------------------------------------------------

/**
 * WeChat error codes that will never clear by trying again.
 *
 * Retrying these costs eight attempts and half an hour of backoff and then
 * parks a row for an operator whose only possible action is "ignore it":
 *
 * - `43004` the user has not followed the account
 * - `43101` the user turned this template off (OA) / refused the subscription
 * - `40003` invalid openid — the identity row is stale
 * - `47003` a field failed the template's own type check, which is a
 *   configuration mistake, not a transient one
 * - `43116`/`43102` the subscription was used up or the template was deleted
 */
const PERMANENT_WECHAT_ERRORS = new Set([40003, 43004, 43101, 43102, 43116, 47003]);

function classify(
  result: { ok: boolean; errcode: number; errmsg: string },
  channel: NotificationChannel,
): ChannelOutcome {
  if (result.ok) return { kind: 'sent' };
  if (PERMANENT_WECHAT_ERRORS.has(result.errcode)) {
    return { kind: 'skipped', reason: `${channel} ${result.errcode}: ${result.errmsg}` };
  }
  return { kind: 'failed', reason: `${channel} ${result.errcode}: ${result.errmsg}` };
}

/** Renders the in-app title and body, falling back to the registry's defaults. */
export function renderInApp(
  event: NotificationEvent,
  channels: NotificationChannels,
  data: Record<string, string>,
): { title: string; content: string } {
  const config = channels.inApp;
  const title = render(config?.title || event.defaults.title, data);
  const content = render(config?.body || event.defaults.body, data);
  return { title, content };
}

export { toTemplateData };
