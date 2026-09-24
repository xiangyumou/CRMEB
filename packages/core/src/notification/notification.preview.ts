import type {
  NotificationChannel,
  NotificationTemplatePreview,
  NotificationTemplatePreviewBody,
  NotificationTestSendBody,
  NotificationTestSendResult,
} from '@shop/contracts/notification/schemas';
import { toMiniPath } from '@shop/contracts/system/storefront-routes';
import { requirePermission } from '../auth/rbac';
import type { Ctx } from '../kernel/context';
import { requireAdminId } from '../kernel/context';
import { DomainError } from '../kernel/errors';
import { fromId } from '../kernel/ids';
import { enforce, fixedWindow } from '../kernel/rate-limit';
import { publicOrigin } from '../system';
import { notificationPermissions } from './permissions';
import type { NotificationChannels } from './notification.repo';
import { findNotificationEvent, type NotificationEvent } from './notification.registry';
import {
  clampField,
  placeholdersIn,
  render,
  renderFields,
  renderRoute,
  WECHAT_FIELD_LIMIT,
} from './notification.render';
import {
  absoluteLink,
  renderInApp,
  sendSms,
  sendWechatMini,
  sendWechatOa,
  type ChannelOutcome,
} from './notification.send';

/**
 * 预览 and 测试发送 for the template form.
 *
 * Both take the form as it stands — saved or not — and both go through the
 * send path's own functions: the preview renders with `render`/`renderFields`/
 * `renderRoute`, the test send calls `sendWechatOa`/`sendWechatMini`/`sendSms`.
 * So what the operator sees here is what a shopper gets, and a template that
 * previews clean cannot be rejected for a reason the preview hid.
 */

export async function preview(
  ctx: Ctx,
  params: { code: string },
  body: NotificationTemplatePreviewBody,
): Promise<NotificationTemplatePreview> {
  requirePermission(ctx, notificationPermissions['template:read']);
  const event = requireEvent(params.code);
  return explainPreview({
    event,
    channels: body.channels as NotificationChannels,
    data: body.data,
    origin: await publicOrigin(ctx),
  });
}

export interface PreviewInput {
  event: NotificationEvent;
  channels: NotificationChannels;
  data: Readonly<Record<string, string>>;
  /** `site.publicOrigin`, which a relative 公众号 link is joined onto. */
  origin: string;
}

/**
 * The pure half of the preview: every supported channel rendered, and what
 * would go wrong. Warnings are for the channels switched on in the form — a
 * channel the shop does not use would otherwise fill the list with 还没填模板 ID.
 */
export function explainPreview(input: PreviewInput): NotificationTemplatePreview {
  const { event, channels, data } = input;
  const supports = (channel: NotificationChannel): boolean => event.channels.includes(channel);
  const warnings: string[] = [];
  const placeholders = new PlaceholderAudit(event, data);
  // Where a switched-off channel's warnings go: nowhere.
  const sinkFor = (enabled: boolean): Sink =>
    enabled ? { warnings, placeholders } : { warnings: [], placeholders: null };

  let inApp: NotificationTemplatePreview['inApp'] = null;
  if (supports('inApp')) {
    const config = channels.inApp;
    const enabled = config?.enabled ?? false;
    const sink = sinkFor(enabled);
    sink.placeholders?.scan('站内信标题', config?.title || event.defaults.title);
    sink.placeholders?.scan('站内信正文', config?.body || event.defaults.body);
    const rendered = renderInApp(event, channels, { ...data });
    inApp = { enabled, ...rendered, opens: opensOf(event, data) };
  }

  let wechatOa: NotificationTemplatePreview['wechatOa'] = null;
  if (supports('wechatOa')) {
    const config = channels.wechatOa;
    const enabled = config?.enabled ?? false;
    const sink = sinkFor(enabled);
    const templateId = config?.templateId ?? '';
    if (templateId === '') sink.warnings.push('公众号：还没填模板 ID，不会发送');
    const link = render(config?.linkUrl ?? event.link ?? '', data);
    if (config?.linkUrl) sink.placeholders?.scan('公众号跳转链接', config.linkUrl);
    const url = absoluteLink(input.origin, link) ?? null;
    if (link !== '' && url === null) {
      sink.warnings.push('公众号：跳转链接是相对路径，但站点设置里没有对外域名，发送时会去掉链接');
    }
    const fields = renderWechatFields('公众号', config?.fields, data, sink);
    wechatOa = { enabled, templateId, url, fields };
  }

  let wechatMini: NotificationTemplatePreview['wechatMini'] = null;
  if (supports('wechatMini')) {
    const config = channels.wechatMini;
    const enabled = config?.enabled ?? false;
    const sink = sinkFor(enabled);
    const templateId = config?.templateId ?? '';
    if (templateId === '') sink.warnings.push('小程序：还没填模板 ID，不会发送');
    const route = event.route ? renderRoute(event.route, data) : null;
    if (event.route && route === null) {
      sink.warnings.push('小程序：跳转页面缺少参数，消息会打开小程序首页');
    }
    const fields = renderWechatFields('小程序', config?.fields, data, sink);
    for (const field of fields) {
      const problem = subscribeFieldProblem(field.key, field.value);
      if (problem) {
        sink.warnings.push(`小程序字段 ${field.key}：${problem}，微信会拒收整条消息（47003）`);
      }
    }
    wechatMini = { enabled, templateId, page: route ? toMiniPath(route) : null, fields };
  }

  let sms: NotificationTemplatePreview['sms'] = null;
  if (supports('sms')) {
    const config = channels.sms;
    const enabled = config?.enabled ?? false;
    const templateCode = config?.templateCode ?? '';
    if (templateCode === '') sinkFor(enabled).warnings.push('短信：还没填模板编号，不会发送');
    sms = {
      enabled,
      templateCode,
      signName: config?.signName || null,
      // `sendSms` hands the provider every variable; its template picks the ones it names.
      params: Object.entries(data).map(([key, value]) => ({ key, value })),
    };
  }

  return { inApp, wechatOa, wechatMini, sms, warnings: [...placeholders.warnings(), ...warnings] };
}

/** Where tapping the in-app message goes: the mini-program page, or the admin path. */
function opensOf(event: NotificationEvent, data: Readonly<Record<string, string>>): string | null {
  if (event.route) {
    const route = renderRoute(event.route, data);
    return route ? toMiniPath(route) : null;
  }
  if (event.link) return render(event.link, data) || null;
  return null;
}

interface Sink {
  warnings: string[];
  placeholders: PlaceholderAudit | null;
}

/**
 * Renders a WeChat field map the way the send does, and says what the send
 * would silently do to it: truncate a long field, drop an empty one, or send
 * nothing at all.
 */
function renderWechatFields(
  label: string,
  fields: Readonly<Record<string, string>> | undefined,
  data: Readonly<Record<string, string>>,
  { warnings, placeholders }: Sink,
): { key: string; value: string }[] {
  const entries = Object.entries(fields ?? {});
  for (const [key, template] of entries) {
    placeholders?.scan(`${label} ${key}`, template);
    const value = render(template, data);
    if (value === '') {
      warnings.push(`${label}字段 ${key} 渲染后为空，发送时会被去掉`);
    } else if (clampField(value) !== value) {
      warnings.push(`${label}字段 ${key} 超过 ${WECHAT_FIELD_LIMIT} 字，发送时会被截断`);
    }
  }
  const rendered = renderFields(fields, data);
  if (entries.length > 0 && Object.keys(rendered).length === 0) {
    warnings.push(`${label}：所有字段渲染后都为空，不会发送`);
  } else if (entries.length === 0) {
    warnings.push(`${label}：还没配置字段映射，不会发送`);
  }
  return Object.entries(rendered).map(([key, { value }]) => ({ key, value }));
}

/**
 * Collects placeholder problems across every channel, so `{{trackingNo}}`
 * used in four places is one warning naming the four places rather than four
 * warnings.
 */
class PlaceholderAudit {
  private readonly unknown = new Map<string, string[]>();
  private readonly empty = new Map<string, string[]>();

  constructor(
    private readonly event: NotificationEvent,
    private readonly data: Readonly<Record<string, string>>,
  ) {}

  scan(where: string, template: string): void {
    for (const name of placeholdersIn(template)) {
      const bucket = !this.event.variables.includes(name)
        ? this.unknown
        : (this.data[name] ?? '') === ''
          ? this.empty
          : null;
      if (bucket) bucket.set(name, [...(bucket.get(name) ?? []), where]);
    }
  }

  warnings(): string[] {
    return [
      ...[...this.unknown].map(
        ([name, where]) =>
          `{{${name}}} 不是这个通知的变量（用在：${where.join('、')}），发出去会是空的`,
      ),
      ...[...this.empty].map(
        ([name, where]) =>
          `示例数据里 {{${name}}} 为空（用在：${where.join('、')}），这一处会显示为空`,
      ),
    ];
  }
}

/**
 * WeChat's subscribe-message value rules, by the field's type prefix
 * (`thing3` → `thing`). A value that breaks one fails the whole message with
 * `47003`, which the send log records as a skip and nobody reads. Only the
 * rules that are about length or character class are checked; `time` and
 * `date` accept too many formats to be worth guessing at.
 */
export function subscribeFieldProblem(key: string, value: string): string | null {
  const type = key.replace(/\d+$/, '');
  const length = [...value].length;
  switch (type) {
    case 'thing':
      return length > 20 ? `超过 20 个字（现在 ${length} 个）` : null;
    case 'character_string':
      if (length > 32) return `超过 32 个字符（现在 ${length} 个）`;
      return /^[\x21-\x7e]*$/.test(value) ? null : '只能是字母、数字和符号，不能有汉字或空格';
    case 'number':
      return /^\d{1,32}(\.\d+)?$/.test(value) ? null : '只能是数字';
    case 'letter':
      return /^[A-Za-z]{1,32}$/.test(value) ? null : '只能是 32 个以内的字母';
    case 'amount':
      return /^[¥￥]?\d{1,10}(\.\d{1,2})?元?$/.test(value)
        ? null
        : '要是金额格式，如 199.00 或 ¥199.00';
    case 'phrase':
      return length > 5 ? `超过 5 个字（现在 ${length} 个）` : null;
    case 'name':
      return length > 10 ? `超过 10 个字（现在 ${length} 个）` : null;
    case 'phone_number':
      return /^[\d+\-() ]{1,17}$/.test(value) ? null : '要是 17 位以内的电话号码';
    case 'car_number':
      return length > 8 ? `超过 8 个字符（现在 ${length} 个）` : null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// test send
// ---------------------------------------------------------------------------

/** A real message costs a real SMS; five a minute is plenty for checking wording. */
const TEST_SENDS_PER_MINUTE = 5;

export async function testSend(
  ctx: Ctx,
  params: { code: string },
  body: NotificationTestSendBody,
): Promise<NotificationTestSendResult> {
  requirePermission(ctx, notificationPermissions['template:write']);
  const event = requireEvent(params.code);
  if (event.audience !== 'user' || !event.channels.includes(body.channel)) {
    throw new DomainError('NOTIFICATION_CHANNEL_NOT_APPLICABLE');
  }

  await enforce(
    fixedWindow(ctx.redis, {
      key: `notification:test:${requireAdminId(ctx)}`,
      limit: TEST_SENDS_PER_MINUTE,
      windowMs: 60_000,
      nowMs: ctx.clock.now().getTime(),
    }),
  );

  // Testing before 启用 is the point, so the channel goes out whatever its switch says.
  const channels = {
    ...(body.channels as NotificationChannels),
    [body.channel]: { ...body.channels[body.channel], enabled: true },
  } as NotificationChannels;
  const input = { event, channels, userId: fromId(body.userId), data: { ...body.data } };
  const send = { wechatOa: sendWechatOa, wechatMini: sendWechatMini, sms: sendSms }[body.channel];

  let outcome: ChannelOutcome;
  try {
    outcome = await send(ctx, input);
  } catch (error) {
    outcome = { kind: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
  ctx.logger.info(
    { code: event.code, channel: body.channel, userId: body.userId, outcome },
    'notification test send',
  );
  return describeOutcome(body.channel, outcome);
}

const SENT: Record<NotificationTestSendBody['channel'], string> = {
  wechatOa: '已发送，请在微信里查收',
  wechatMini: '已发送，请在微信「服务通知」里查收',
  sms: '已提交给短信服务商，请留意手机',
};

const SKIP_REASONS: Record<string, string> = {
  'no template id': '还没填模板 ID',
  'no template code': '还没填短信模板编号',
  'user has no oa openid': '该会员没有关注公众号或没有公众号授权记录',
  'user has no mini openid': '该会员没有用过小程序（没有小程序 openid）',
  'no rendered fields': '字段映射渲染后全是空的，没有可发送的内容',
  'no sms provider registered': '没有配置短信服务商（系统设置 → 短信）',
};

/** WeChat's codes an operator actually meets while testing, in their words. */
const WECHAT_CODES: Record<number, string> = {
  40003: 'openid 无效，该会员的微信授权记录可能已过期',
  40037: '模板 ID 不对，请到公众平台核对',
  41030: '跳转页面不存在，小程序可能还没发布这个页面',
  43004: '该会员没有关注公众号',
  43101: '该会员没有订阅这条消息——小程序订阅消息要用户先在小程序里点过「允许」',
  43102: '模板已被删除或停用',
  43116: '模板已被删除或停用',
  47003: '字段内容不符合模板要求，看看预览里的提示',
};

export function describeOutcome(
  channel: NotificationTestSendBody['channel'],
  outcome: ChannelOutcome,
): NotificationTestSendResult {
  if (outcome.kind === 'sent') return { outcome: 'sent', message: SENT[channel] };
  const reason = outcome.reason;
  const code = /\b(\d{5})\b/.exec(reason)?.[1];
  const known = SKIP_REASONS[reason] ?? (code ? WECHAT_CODES[Number(code)] : undefined);
  const explained = known ? (code ? `${known}（${reason}）` : known) : reason;
  return {
    outcome: outcome.kind,
    message: outcome.kind === 'skipped' ? `没有发出：${explained}` : `发送失败：${explained}`,
  };
}

function requireEvent(code: string): NotificationEvent {
  const event = findNotificationEvent(code);
  if (!event) throw new DomainError('NOTIFICATION_TEMPLATE_NOT_FOUND');
  return event;
}
