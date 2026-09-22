import type {
  NotificationChannel,
  NotificationChannelToggleBody,
  NotificationLog,
  NotificationLogListQuery,
  NotificationLogRetryResult,
  NotificationTemplate,
  NotificationTemplateForm,
  NotificationTemplateListQuery,
} from '@shop/contracts/notification/schemas';
import { requirePermission } from '../auth/rbac';
import type { Ctx } from '../kernel/context';
import { DomainError } from '../kernel/errors';
import { toId } from '../kernel/ids';
import * as effectsRepo from './notification.effects.repo';
import { notificationPermissions } from './permissions';
import * as repo from './notification.repo';
import type { NotificationChannels } from './notification.repo';
import {
  allNotificationEvents,
  findNotificationEvent,
  type NotificationEvent,
} from './notification.registry';
import { defaultChannels, readClaimedChannels } from './notification.service';

/**
 * The operator's three screens.
 *
 * The template list is **driven by the registry, not by the table**: the rows
 * are what the code can send, and the table only remembers what an operator
 * chose. That is why the list seeds missing rows as it reads and why a row
 * whose code has left the registry simply stops appearing instead of hanging
 * around as an event nobody can trigger — the legacy table had four of those.
 */

interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listTemplates(
  ctx: Ctx,
  query: NotificationTemplateListQuery,
): Promise<Paged<NotificationTemplate>> {
  requirePermission(ctx, notificationPermissions['template:read']);

  const keyword = query.keyword?.trim() ?? '';
  const events = allNotificationEvents().filter((event) => {
    if (query.audience !== undefined && event.audience !== query.audience) return false;
    if (keyword === '') return true;
    return event.name.includes(keyword) || event.code.includes(keyword);
  });

  await seedMissing(ctx, events);
  const rows = await repo.listTemplates(
    ctx.db,
    events.map((event) => event.code),
  );
  const byCode = new Map(rows.map((row) => [row.code, row]));

  const offset = (query.page - 1) * query.pageSize;
  const page = events.slice(offset, offset + query.pageSize);

  return {
    items: page.map((event) => toTemplate(event, byCode.get(event.code))),
    total: events.length,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getTemplate(
  ctx: Ctx,
  input: { code: string },
): Promise<NotificationTemplate> {
  requirePermission(ctx, notificationPermissions['template:read']);
  const event = requireEvent(input.code);
  await seedMissing(ctx, [event]);
  return toTemplate(event, await repo.findTemplate(ctx.db, event.code));
}

export async function saveTemplate(
  ctx: Ctx,
  params: { code: string },
  body: NotificationTemplateForm,
): Promise<NotificationTemplate> {
  requirePermission(ctx, notificationPermissions['template:write']);
  const event = requireEvent(params.code);
  await seedMissing(ctx, [event]);

  const channels = validateChannels(event, body.channels as NotificationChannels);
  await repo.saveTemplate(ctx.db, event.code, {
    channels,
    isEnabled: body.isEnabled,
    now: ctx.clock.now(),
  });
  return toTemplate(event, await repo.findTemplate(ctx.db, event.code));
}

export async function toggleChannel(
  ctx: Ctx,
  params: { code: string; channel: NotificationChannel },
  body: NotificationChannelToggleBody,
): Promise<NotificationTemplate> {
  requirePermission(ctx, notificationPermissions['template:write']);
  const event = requireEvent(params.code);
  await seedMissing(ctx, [event]);

  const row = await repo.findTemplate(ctx.db, event.code);
  const current: NotificationChannels = row?.channels ?? defaultChannels(event);
  const existing = current[params.channel];
  if (existing === undefined) throw new DomainError('NOTIFICATION_CHANNEL_NOT_APPLICABLE');

  const channels = validateChannels(event, {
    ...current,
    [params.channel]: { ...existing, enabled: body.enabled },
  } as NotificationChannels);

  await repo.saveTemplate(ctx.db, event.code, {
    channels,
    isEnabled: row?.isEnabled ?? true,
    now: ctx.clock.now(),
  });
  return toTemplate(event, await repo.findTemplate(ctx.db, event.code));
}

// ---------------------------------------------------------------------------
// the send log
// ---------------------------------------------------------------------------

export async function listLogs(
  ctx: Ctx,
  query: NotificationLogListQuery,
): Promise<Paged<NotificationLog>> {
  requirePermission(ctx, notificationPermissions['log:read']);
  const { rows, total } = await effectsRepo.listNotificationEffects(ctx.db, {
    status: query.status,
    ...(query.code === undefined ? {} : { code: query.code }),
    offset: (query.page - 1) * query.pageSize,
    limit: query.pageSize,
  });
  return {
    items: await Promise.all(rows.map((row) => toLog(ctx, row))),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function retryLog(
  ctx: Ctx,
  input: { id: string },
): Promise<NotificationLogRetryResult> {
  requirePermission(ctx, notificationPermissions['log:handle']);
  const id = Number(input.id);
  const row = await effectsRepo.findNotificationEffect(ctx.db, id);
  if (!row) throw new DomainError('NOT_FOUND');

  const { won } = await effectsRepo.requeueNotificationEffect(ctx.db, id, ctx.clock.now());
  const fresh = (await effectsRepo.findNotificationEffect(ctx.db, id)) ?? row;
  return {
    log: await toLog(ctx, fresh),
    succeeded: won,
    message: won ? '已重新排队，稍后自动执行' : '该发送记录当前无法重试',
  };
}

// ---------------------------------------------------------------------------
// mapping
// ---------------------------------------------------------------------------

function requireEvent(code: string): NotificationEvent {
  const event = findNotificationEvent(code);
  if (!event) throw new DomainError('NOTIFICATION_TEMPLATE_NOT_FOUND');
  return event;
}

async function seedMissing(ctx: Ctx, events: readonly NotificationEvent[]): Promise<void> {
  if (events.length === 0) return;
  const existing = new Set(
    (
      await repo.listTemplates(
        ctx.db,
        events.map((event) => event.code),
      )
    ).map((row) => row.code),
  );
  const missing = events.filter((event) => !existing.has(event.code));
  if (missing.length === 0) return;
  await ctx.withTx((tx) =>
    repo.upsertTemplates(
      tx,
      missing.map((event) => ({
        code: event.code,
        name: event.name,
        description: event.description,
        audience: event.audience,
        channels: defaultChannels(event),
        variables: [...event.variables],
      })),
    ),
  );
}

/**
 * Refuses a channel that is switched on with nothing to send.
 *
 * The check happens here rather than at send time on purpose: at send time the
 * only thing that can be done about it is a log line nobody reads, whereas the
 * operator is looking at the form right now.
 */
function validateChannels(
  event: NotificationEvent,
  channels: NotificationChannels,
): NotificationChannels {
  const out: NotificationChannels = {};
  for (const [name, config] of Object.entries(channels) as [
    NotificationChannel,
    NotificationChannels[NotificationChannel],
  ][]) {
    if (config === undefined) continue;
    if (!event.channels.includes(name)) {
      if (config.enabled) throw new DomainError('NOTIFICATION_CHANNEL_NOT_APPLICABLE');
      continue;
    }
    if (config.enabled) {
      const missing = missingFields(name, config);
      if (missing.length > 0) {
        throw new DomainError('NOTIFICATION_CHANNEL_INCOMPLETE', {
          details: { channel: name, missing },
        });
      }
    }
    Object.assign(out, { [name]: config });
  }
  return out;
}

function missingFields(
  channel: NotificationChannel,
  config: NonNullable<NotificationChannels[NotificationChannel]>,
): string[] {
  const missing: string[] = [];
  if (channel === 'inApp') {
    const inApp = config as NonNullable<NotificationChannels['inApp']>;
    if (!inApp.title?.trim()) missing.push('title');
    if (!inApp.body?.trim()) missing.push('body');
  } else if (channel === 'sms') {
    const sms = config as NonNullable<NotificationChannels['sms']>;
    if (!sms.templateCode?.trim()) missing.push('templateCode');
  } else {
    const wechat = config as NonNullable<NotificationChannels['wechatOa']>;
    if (!wechat.templateId?.trim()) missing.push('templateId');
    if (Object.keys(wechat.fields ?? {}).length === 0) missing.push('fields');
  }
  return missing;
}

function toTemplate(
  event: NotificationEvent,
  row: { channels: NotificationChannels; isEnabled: boolean; updatedAt: Date } | undefined,
): NotificationTemplate {
  return {
    code: event.code,
    name: event.name,
    description: event.description,
    audience: event.audience,
    channels: (row?.channels ?? defaultChannels(event)) as NotificationTemplate['channels'],
    variables: [...event.variables],
    supportedChannels: [...event.channels],
    isEnabled: row?.isEnabled ?? true,
    updatedAt: (row?.updatedAt ?? new Date(0)).toISOString(),
  };
}

/** `<code>:<subject scope>:<subject id>` back into its parts. */
export function splitScopeId(scopeId: string): { code: string; subject: string } {
  const first = scopeId.indexOf(':');
  if (first < 0) return { code: scopeId, subject: '' };
  return { code: scopeId.slice(0, first), subject: scopeId.slice(first + 1) };
}

async function toLog(ctx: Ctx, row: effectsRepo.NotificationEffectRow): Promise<NotificationLog> {
  const { code, subject } = splitScopeId(row.scopeId);
  const event = findNotificationEvent(code);
  const payload = row.payload as { userId?: number } | null;
  const recipients = event?.audience === 'admin' ? [null] : [payload?.userId ?? null];
  const enabled = event ? [...event.channels] : [];
  const sentChannels =
    row.status === 'done'
      ? enabled
      : await readClaimedChannels(ctx, row.scopeId, recipients, enabled);

  return {
    id: toId(row.id),
    code,
    name: event?.name ?? code,
    audience: event?.audience ?? 'user',
    subject,
    status: row.status === 'done' ? 'done' : row.status === 'unknown' ? 'unknown' : 'pending',
    attempts: row.attempts,
    sentChannels,
    failedChannels: row.status === 'done' ? [] : enabled.filter((c) => !sentChannels.includes(c)),
    lastError: row.lastError,
    nextRunAt: row.nextRunAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
