/**
 * `eb_system_notification` and `eb_message_system` → the `notification` schema.
 *
 * Sources (`crmeb/public/install/crmeb.sql`):
 *
 * | Legacy                   | New                      |
 * | ------------------------ | ------------------------ |
 * | `eb_system_notification` | `notification_templates` |
 * | `eb_message_system`      | `notification_messages`  |
 *
 * A pure function: rows in, rows and a report out. Nothing here opens a
 * connection or looks at a clock.
 *
 * ## The event code is compiled in, so a row with an unknown `mark` is dropped
 *
 * Legacy operators could edit `mark` in the admin, and several deployments have
 * rows whose `mark` no longer matches anything the PHP sends — the notification
 * had silently stopped years earlier and nobody knew. Here the registry in
 * `@shop/core/notification` is the list of events that can fire, so a row whose
 * `mark` has no counterpart carries no setting worth keeping. Each one is named
 * in `templatesDroppedUnknownMark`; none disappear quietly.
 *
 * Two legacy rows (`order_postage_success` 发货 and `order_deliver_success`
 * 送货) map to the same `order_shipped`. First wins and the second is reported,
 * because same-city delivery left with the feature that used it.
 *
 * ## Why the WeChat field map does not survive
 *
 * The legacy `wechat_content` is a *copy of the template as 公众平台 displays
 * it* — `订单号{{character_string2.DATA}}` — not a mapping from our data to
 * WeChat's field names. That mapping lived in PHP, one hand-written array per
 * call site. So the migration carries what is genuinely data (the template key,
 * the template id, the link) and leaves `fields` empty, listing every affected
 * template in `templatesNeedingFieldMap`.
 *
 * Deriving it by matching the Chinese labels in `wechat_content` against the
 * labels in `variable` was tried and rejected: `订单编号` and `订单号` are the
 * same thing in one row and different things in another, and a wrong guess
 * sends a customer somebody else's number under WeChat's own branding. An empty
 * map is visible in the admin on day one; a wrong one is not.
 *
 * ## Why unmapped placeholders stay in the wording
 *
 * The legacy bodies use `{order_id}`; the new ones use `{{orderNo}}`. Known
 * names are translated (see `PLACEHOLDER_MAP`). The rest — `{store_name}`,
 * `{user_address}` — have no counterpart among the event's variables, and are
 * left in the text rather than deleted, with the row listed in
 * `templatesNeedingWordingReview`. Deleting words from a shop's own wording
 * without telling anyone is the worse failure: a single-brace token renders
 * literally and an operator fixes it in 通知模板 in a minute, whereas a
 * sentence that lost its subject reads as correct and stays wrong.
 */

// ---------------------------------------------------------------------------
// legacy row shapes
// ---------------------------------------------------------------------------

/** `eb_system_notification`. The three-state flags are 0 不存在 / 1 开启 / 2 关闭. */
export interface LegacySystemNotification {
  id: number;
  mark: string;
  name: string;
  title: string;
  is_system: number;
  system_title: string;
  system_text: string;
  is_wechat: number;
  wechat_tempkey: string;
  wechat_content: string;
  wechat_tempid: string;
  wechat_link?: string;
  is_routine: number;
  routine_tempkey: string;
  routine_content: string;
  routine_tempid: string;
  routine_link?: string;
  is_sms: number;
  sms_id: string;
  sms_text: string;
  /** `{order_id}订单号,{pay_price}支付金额` — token and label, comma separated. */
  variable: string;
  /** 1 用户, 2 管理员. */
  type: number;
  add_time: number;
}

/** `eb_message_system` — the 站内信 inbox. */
export interface LegacyMessageSystem {
  id: number;
  mark: string;
  uid: number;
  title: string;
  content: string;
  /** JSON-encoded parameters, or `''`. */
  data: string;
  look: number;
  /** 1 普通用户, 2 管理员. */
  type: number;
  add_time: number;
  is_del: number;
}

// ---------------------------------------------------------------------------
// output row shapes (by hand, so `@shop/etl` does not depend on `@shop/db`)
// ---------------------------------------------------------------------------

export interface NotificationChannelsRow {
  inApp?: { enabled: boolean; title: string; body: string };
  wechatOa?: {
    enabled: boolean;
    templateKey: string;
    templateId?: string;
    fields?: Record<string, string>;
    linkUrl?: string;
  };
  wechatMini?: {
    enabled: boolean;
    templateKey: string;
    templateId?: string;
    fields?: Record<string, string>;
    page?: string;
  };
  sms?: { enabled: boolean; templateCode: string; signName?: string; body?: string };
}

export interface NotificationTemplateRow {
  /** Registry code, not the legacy id: the row is identified by what fires it. */
  code: string;
  name: string;
  description: string | null;
  audience: 'user' | 'admin';
  channels: NotificationChannelsRow;
  variables: string[];
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationMessageRow {
  id: number;
  code: string | null;
  audience: 'user' | 'admin';
  userId: number | null;
  adminId: number | null;
  title: string;
  content: string;
  data: Record<string, unknown> | null;
  readAt: Date | null;
  createdAt: Date;
  deletedAt: Date | null;
}

export interface NotificationMigrationReport {
  templates: number;
  /** `mark` values the registry does not know, with the row's name for context. */
  templatesDroppedUnknownMark: string[];
  /** Two legacy rows mapped to one code; the later one's `mark`. */
  templatesDroppedDuplicateCode: string[];
  /** Codes whose OA or mini-program channel arrived without a field map. */
  templatesNeedingFieldMap: string[];
  /** Codes whose wording still contains a legacy `{token}` with no counterpart. */
  templatesNeedingWordingReview: string[];
  /** Registry codes no legacy row fed. They seed from the registry's defaults. */
  templatesNotInLegacy: string[];
  messages: number;
  messagesDroppedDeleted: number;
  messagesDroppedUnknownRecipient: number;
  messagesUnread: number;
}

export interface NotificationMigrationInput {
  notifications?: readonly LegacySystemNotification[];
  messages?: readonly LegacyMessageSystem[];
  /**
   * The registry's codes, from `allNotificationEvents()` in
   * `@shop/core/notification`. Passing them in keeps this file free of a
   * dependency on `@shop/core`, exactly as `system.ts` does with config groups.
   *
   * Omitting it accepts every mapped `mark`, which is what the mapper's own
   * tests do; the runner always passes the real list.
   */
  registryCodes?: readonly string[];
  /** Existing `users.id`. A message for a user the migration dropped is dropped too. */
  knownUserIds?: ReadonlySet<number>;
  /** Existing `admins.id`, likewise. */
  knownAdminIds?: ReadonlySet<number>;
}

export interface NotificationMigrationOutput {
  templates: NotificationTemplateRow[];
  messages: NotificationMessageRow[];
  report: NotificationMigrationReport;
}

// ---------------------------------------------------------------------------
// the legacy → registry maps
// ---------------------------------------------------------------------------

/**
 * `eb_system_notification.mark` → registry code.
 *
 * The full reasoning per row is in `notification.registry.ts`. In short:
 * `verify_code` is E1's SMS code rather than a business event, the five
 * `*_pink_*` rows belong to group buy (stream D registers its own), and
 * `revenue_received` left with distribution.
 */
export const MARK_TO_CODE: ReadonlyMap<string, string> = new Map([
  ['order_pay_success', 'order_paid'],
  ['order_postage_success', 'order_shipped'],
  ['order_deliver_success', 'order_shipped'],
  ['order_take', 'order_received'],
  ['order_refund', 'refund_settled'],
  ['send_order_refund_no_status', 'refund_rejected'],
  ['send_order_apply_refund', 'admin_refund_applied'],
  ['price_revision', 'order_price_changed'],
  ['order_pay_false', 'order_unpaid_reminder'],
  ['admin_pay_success_code', 'admin_order_paid'],
  ['send_admin_confirm_take_over', 'admin_order_received'],
]);

/**
 * Legacy `{token}` → new placeholder name.
 *
 * Only tokens that name the same thing are here. `{store_name}`,
 * `{user_address}` and `{total_num}` are deliberately absent: the events'
 * variables do not carry them, so translating them would produce a placeholder
 * that renders as the empty string — worse than the visible legacy token,
 * because nobody would ever notice.
 */
export const PLACEHOLDER_MAP: ReadonlyMap<string, string> = new Map([
  ['order_id', 'orderNo'],
  ['pay_price', 'amount'],
  ['refund_price', 'amount'],
  ['nickname', 'nickname'],
  ['delivery_name', 'company'],
  ['delivery_id', 'trackingNo'],
]);

// ---------------------------------------------------------------------------
// mapping
// ---------------------------------------------------------------------------

/** Legacy unix seconds; `0` is the legacy way of saying NULL. */
function instant(seconds: number): Date | null {
  return seconds > 0 ? new Date(seconds * 1000) : null;
}

function blankToUndefined(value: string | null | undefined): string | undefined {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? undefined : trimmed;
}

/** The legacy three-state flag: 0 不存在, 1 开启, 2 关闭. */
function channelState(flag: number): { present: boolean; enabled: boolean } {
  return { present: flag === 1 || flag === 2, enabled: flag === 1 };
}

/**
 * `您的订单{order_id}已发货` → `您的订单{{orderNo}}已发货`, and the tokens that
 * had no counterpart, so the caller can report the row.
 *
 * `{{…}}` in the input is left alone: `wechat_content` is full of
 * `{{thing3.DATA}}` and re-wrapping those would produce `{{{{thing3.DATA}}}}`.
 */
export function translatePlaceholders(text: string): { text: string; unmapped: string[] } {
  const unmapped: string[] = [];
  const out = text.replace(/(?<!\{)\{([a-z][a-z0-9_]*)\}(?!\})/gi, (whole, token: string) => {
    const mapped = PLACEHOLDER_MAP.get(token);
    if (mapped === undefined) {
      if (!unmapped.includes(token)) unmapped.push(token);
      return whole;
    }
    return `{{${mapped}}}`;
  });
  return { text: out, unmapped };
}

/** `{order_id}订单号,{pay_price}支付金额` → the new names, in order, deduplicated. */
export function parseLegacyVariables(raw: string): string[] {
  const names: string[] = [];
  for (const match of raw.matchAll(/\{([a-z][a-z0-9_]*)\}/gi)) {
    const token = match[1];
    if (token === undefined) continue;
    const mapped = PLACEHOLDER_MAP.get(token);
    if (mapped !== undefined && !names.includes(mapped)) names.push(mapped);
  }
  return names;
}

export function mapNotifications(input: NotificationMigrationInput): NotificationMigrationOutput {
  const templates: NotificationTemplateRow[] = [];
  const messages: NotificationMessageRow[] = [];

  const templatesDroppedUnknownMark: string[] = [];
  const templatesDroppedDuplicateCode: string[] = [];
  const templatesNeedingFieldMap: string[] = [];
  const templatesNeedingWordingReview: string[] = [];
  let messagesDroppedDeleted = 0;
  let messagesDroppedUnknownRecipient = 0;
  let messagesUnread = 0;

  const registryCodes = input.registryCodes ? new Set(input.registryCodes) : null;
  const seenCodes = new Set<string>();

  for (const legacy of input.notifications ?? []) {
    const code = MARK_TO_CODE.get(legacy.mark);
    if (code === undefined || (registryCodes !== null && !registryCodes.has(code))) {
      templatesDroppedUnknownMark.push(`${legacy.mark}（${legacy.name}）`);
      continue;
    }
    if (seenCodes.has(code)) {
      templatesDroppedDuplicateCode.push(legacy.mark);
      continue;
    }
    seenCodes.add(code);

    const unmapped: string[] = [];
    const take = (text: string): string => {
      const result = translatePlaceholders(text);
      for (const token of result.unmapped) if (!unmapped.includes(token)) unmapped.push(token);
      return result.text;
    };

    const channels: NotificationChannelsRow = {};

    const inApp = channelState(legacy.is_system);
    if (inApp.present) {
      channels.inApp = {
        enabled: inApp.enabled,
        title: take(legacy.system_title),
        body: take(legacy.system_text),
      };
    }

    let needsFieldMap = false;

    const oa = channelState(legacy.is_wechat);
    if (oa.present) {
      const linkUrl = blankToUndefined(legacy.wechat_link);
      channels.wechatOa = {
        enabled: oa.enabled,
        templateKey: legacy.wechat_tempkey,
        ...(blankToUndefined(legacy.wechat_tempid) === undefined
          ? {}
          : { templateId: legacy.wechat_tempid.trim() }),
        ...(linkUrl === undefined ? {} : { linkUrl }),
      };
      needsFieldMap = true;
    }

    const mini = channelState(legacy.is_routine);
    if (mini.present) {
      const page = blankToUndefined(legacy.routine_link);
      channels.wechatMini = {
        enabled: mini.enabled,
        templateKey: legacy.routine_tempkey,
        ...(blankToUndefined(legacy.routine_tempid) === undefined
          ? {}
          : { templateId: legacy.routine_tempid.trim() }),
        ...(page === undefined ? {} : { page }),
      };
      needsFieldMap = true;
    }

    const sms = channelState(legacy.is_sms);
    if (sms.present) {
      const body = blankToUndefined(take(legacy.sms_text));
      channels.sms = {
        enabled: sms.enabled,
        templateCode: legacy.sms_id,
        ...(body === undefined ? {} : { body }),
      };
    }

    if (needsFieldMap) templatesNeedingFieldMap.push(code);
    if (unmapped.length > 0) templatesNeedingWordingReview.push(code);

    const createdAt = instant(legacy.add_time) ?? new Date(0);
    templates.push({
      code,
      name: legacy.name,
      description: blankToUndefined(legacy.title) ?? null,
      audience: legacy.type === 2 ? 'admin' : 'user',
      channels,
      variables: parseLegacyVariables(legacy.variable),
      // The legacy row has no master switch: an event with every channel off
      // was how an operator turned one off, and that is what the channels say.
      isEnabled: true,
      createdAt,
      updatedAt: createdAt,
    });
  }

  const templatesNotInLegacy = [...(input.registryCodes ?? [])]
    .filter((code) => !seenCodes.has(code))
    .sort();

  for (const legacy of input.messages ?? []) {
    if (legacy.is_del === 1) {
      messagesDroppedDeleted += 1;
      continue;
    }

    const audience: 'user' | 'admin' = legacy.type === 2 ? 'admin' : 'user';
    const known = audience === 'admin' ? input.knownAdminIds : input.knownUserIds;
    if (known !== undefined && !known.has(legacy.uid)) {
      messagesDroppedUnknownRecipient += 1;
      continue;
    }

    const createdAt = instant(legacy.add_time) ?? new Date(0);
    const read = legacy.look === 1;
    if (!read) messagesUnread += 1;

    messages.push({
      id: legacy.id,
      // A message keeps its legacy mark only when the registry still has it;
      // the column is nullable precisely for the free-form broadcasts.
      code: MARK_TO_CODE.get(legacy.mark) ?? null,
      audience,
      userId: audience === 'user' ? legacy.uid : null,
      adminId: audience === 'admin' ? legacy.uid : null,
      title: legacy.title,
      content: legacy.content,
      data: parseMessageData(legacy.data),
      // The legacy table records *that* it was read, never when. The creation
      // time is the only honest timestamp available, and a read receipt on an
      // archived message is not something anything computes from.
      readAt: read ? createdAt : null,
      createdAt,
      deletedAt: null,
    });
  }

  return {
    templates,
    messages,
    report: {
      templates: templates.length,
      templatesDroppedUnknownMark,
      templatesDroppedDuplicateCode,
      templatesNeedingFieldMap,
      templatesNeedingWordingReview,
      templatesNotInLegacy,
      messages: messages.length,
      messagesDroppedDeleted,
      messagesDroppedUnknownRecipient,
      messagesUnread,
    },
  };
}

/** The legacy `data` column: JSON, or `''`, or — in a few deployments — junk. */
function parseMessageData(raw: string): Record<string, unknown> | null {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '' || trimmed[0] !== '{') return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
